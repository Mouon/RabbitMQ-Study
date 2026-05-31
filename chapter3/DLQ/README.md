## RabbitMQ DLQ와 SQS DLQ 정리

RabbitMQ와 SQS는 둘 다 실패 메시지를 DLQ에 보낼 수 있다.
하지만 DLQ로 보내는 기준과 방식은 다르다.

---

## 1. RabbitMQ의 DLQ/DLX

RabbitMQ에서는 **DLQ**와 **DLX**를 구분한다.

```text
DLQ = 실패 메시지를 보관하는 큐
DLX = 실패 메시지를 DLQ로 라우팅하는 Exchange
```

RabbitMQ에서 메시지가 dead letter가 되는 대표 조건은 다음과 같다.

```text
1. basic.reject 또는 basic.nack 호출 시 requeue=false인 경우
2. 메시지 TTL이 만료된 경우
3. 큐 길이 제한을 초과한 경우
```

즉 consumer가 메시지 처리에 실패했을 때 `requeue=false`로 nack 또는 reject를 보내면, RabbitMQ는 해당 메시지를 DLX로 보내고 DLX는 설정된 routing key에 따라 DLQ로 라우팅한다.

```java
channel.basicAck(tag, false);        // 성공 처리
channel.basicNack(tag, false, true); // 실패, 다시 큐에 넣음
channel.basicNack(tag, false, false);// 실패, DLX를 통해 DLQ 이동
```

---

## 2. RabbitMQ에서 retryCount를 필드로 두면 안 되는 이유

RabbitMQ consumer는 보통 Spring Bean으로 등록되고, 기본적으로 싱글톤이다.

따라서 아래처럼 retry count를 필드로 관리하면 문제가 생긴다.

```java
private int retryCount = 0;
```

이 방식은 모든 메시지가 같은 retry count를 공유하게 된다.
또한 listener concurrency가 올라가면 여러 스레드가 동시에 접근하므로 thread-safe하지 않다.

따라서 메시지별 재시도 횟수는 consumer 필드가 아니라 다음과 같은 방식으로 관리해야 한다.

```text
1. 메시지 header에 x-retry-count 저장
2. Spring RetryTemplate 사용
3. application.yml의 listener retry 설정 사용
```

실무에서는 보통 `application.yml` 설정으로 처리하는 방식이 가장 단순하다.

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        retry:
          enabled: true
          max-attempts: 3
          initial-interval: 1000
        default-requeue-rejected: false
```

이렇게 설정하면 listener에서 예외가 발생했을 때 Spring AMQP가 정해진 횟수만큼 재시도한다.
모든 재시도에 실패하면 requeue하지 않고 RabbitMQ가 DLX를 통해 DLQ로 메시지를 이동시킨다.

---

## 3. SQS의 DLQ

SQS는 RabbitMQ와 다르게 consumer가 직접 DLQ 이동을 결정하지 않는다.
SQS가 메시지의 receive count를 기준으로 DLQ 이동 여부를 판단한다.

SQS의 정상 처리 흐름은 다음과 같다.

```text
consumer가 메시지를 receive
→ 처리 성공
→ delete/ack
→ 메시지 제거
```

실패 흐름은 다음과 같다.

```text
consumer가 메시지를 receive
→ 처리 실패
→ delete/ack 안 됨
→ visibility timeout 이후 다시 큐에 나타남
→ 다시 receive됨
→ ApproximateReceiveCount 증가
→ maxReceiveCount 초과
→ SQS가 DLQ로 이동
```

즉 SQS의 DLQ 기준은 `maxReceiveCount`이다.

```text
maxReceiveCount = 같은 메시지를 source queue에서 최대 몇 번 receive할 수 있는지
```

여기서 중요한 점은 `maxReceiveCount`가 exception 횟수가 아니라는 점이다.
SQS는 consumer 내부에서 어떤 예외가 발생했는지 알지 못한다.
SQS가 아는 것은 메시지가 receive 되었고, 이후 delete 되지 않았다는 사실뿐이다.

---

## 4. SQS에서 receive count는 어디에 저장되는가

SQS의 receive count는 payload에 저장되지 않는다.
SQS가 메시지 메타데이터로 관리한다.

```text
payload/body:
  실제 비즈니스 데이터

SQS metadata:
  MessageId
  ReceiptHandle
  ApproximateReceiveCount
```

`ApproximateReceiveCount`는 같은 메시지가 consumer에게 전달될 때마다 증가한다.
이 값이 source queue에 설정된 `maxReceiveCount`를 초과하면 SQS가 해당 메시지를 DLQ로 이동시킨다.

즉 payload가 아래처럼 바뀌는 것은 아니다.

```json
{
  "printResultId": "1234",
  "receiveCount": 3
}
```

receive count는 메시지 본문이 아니라 SQS 내부 메타데이터로 관리된다.

---

## 5. RabbitMQ와 SQS 차이

```text
RabbitMQ
- consumer가 ack/nack/reject로 처리 결과를 명확히 전달한다.
- requeue=false이면 DLX를 통해 DLQ로 이동한다.
- 재시도 횟수는 Spring Retry, 메시지 header 등으로 관리한다.

SQS
- consumer가 성공하면 delete한다.
- 실패하면 delete하지 않는다.
- visibility timeout 이후 메시지가 다시 전달된다.
- SQS가 ApproximateReceiveCount를 증가시킨다.
- maxReceiveCount 초과 시 SQS가 DLQ로 이동시킨다.
```

한 줄로 정리하면 다음과 같다.

```text
RabbitMQ는 consumer의 nack/reject 결정이 DLQ 이동에 직접적인 영향을 준다.
SQS는 메시지가 여러 번 receive 되었는데도 delete되지 않았는지를 보고 SQS가 DLQ로 보낸다.
```

---

## 최종 정리

RabbitMQ에서는 실패 메시지가 다음 조건에서 DLQ로 이동한다.

```text
nack/reject + requeue=false
TTL 만료
queue length 초과
```

SQS에서는 실패 메시지가 다음 조건에서 DLQ로 이동한다.

```text
ApproximateReceiveCount > maxReceiveCount
```

따라서 실무에서는 보통 다음처럼 구성한다.

```text
RabbitMQ
- Spring AMQP retry 설정
- default-requeue-rejected=false
- DLX/DLQ 설정

SQS
- Spring Cloud AWS listener 설정
- visibility timeout 설정
- maxReceiveCount 설정
- DLQ 설정
```

결과적으로 둘 다 실패 메시지를 DLQ에 보관한다는 목적은 같지만, RabbitMQ는 consumer의 nack/reject 중심이고 SQS는 receive count 중심이라는 차이가 있다.
