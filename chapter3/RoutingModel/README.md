# Routing Model을 이용한 Log 수집

# Routing 모델

Routing 모델은 메시지를 Routing Key 기반으로 특정 Queue에 전달하는 방식이다.
Fanout Exchange처럼 모든 Queue에 전달하지 않고, 필요한 Queue에만 메시지를 전달한다.

Routing 모델은:

* Direct Exchange
* Topic Exchange

에서 사용된다.

---

# Direct Exchange vs Topic Exchange

| 특징       | Direct Exchange | Topic Exchange |
| -------- | --------------- | -------------- |
| 라우팅 방식   | 정확히 일치          | 패턴 기반          |
| 와일드카드 지원 | 지원하지 않음         | `*`, `#` 지원    |
| 특징       | 단순하고 명확         | 유연하고 확장성 높음    |
| 사용 사례    | 상태별 처리          | 로그/이벤트 기반 시스템  |


# Topic Exchange 와일드카드

Routing Key는 `.` 기준 단어 조합으로 구성된다.

예시:

```text id="yul1br"
log.error
log.warn
order.completed.email
```

## `*`

정확히 한 단어 매칭

```text id="2v6hsy"
log.*
```

매칭:

```text id="z6v4lf"
log.error
log.warn
log.info
```

## `#`

0개 이상의 여러 단어 매칭

```text id="x2k8o4"
#.error
order.#
```

매칭:

```text id="2d0ttf"
log.error
user.error
order.completed
order.completed.email
order.completed.inventory
```

# Routing 모델의 특징

## 1. 필요한 Queue에만 전달

Fanout처럼 전체 브로드캐스트하지 않는다.

필요한 Consumer만 메시지를 수신한다.

장점:

* 네트워크 부하 감소
* 자원 효율 증가
* 고성능 처리 가능


## 2. Routing Key 기반 분배

Producer는 Routing Key를 함께 전송한다.

```text id="gqxt79"
log.error
order.completed
payment.failed
```

Exchange는 Binding Key와 비교해 Queue를 선택한다.



## 3. Binding 기반 연결

Exchange와 Queue는 Binding으로 연결된다.

```text id="h72n8g"
Binding Key = log.error
```

Routing Key와 Binding Key가 매칭되면 메시지가 전달된다.



# 메시지 흐름

```text id="rbup1l"
1. Producer → Routing Key와 함께 Exchange로 전송
2. Exchange → Binding Key 비교
3. 매칭되는 Queue로 전달
4. Consumer → Queue에서 메시지 소비
```


# 로그 수집 예시

## 로그 유형

```text id="r4i4gd"
log.error
log.warn
log.info
user.error
```

## Topic Exchange 패턴 예시

```text id="z1e5xh"
log.*
```

모든 로그 수신:

```text id="13v6f7"
log.error
log.warn
log.info
```

```text id="9z8hca"
#.error
```

모든 에러 수신:

```text id="tf8hzi"
log.error
user.error
payment.error
```


# 주문 시스템 예시

주문 완료 이벤트:

```text id="kuxz2m"
order.completed
```

후속 처리:

```text id="m57x8u"
order.completed.shipped
order.completed.inventory
order.completed.email
```

각 Queue가 필요한 이벤트만 수신 가능하다.


# Routing 모델 활용 사례

* 로그 수집 시스템
* 주문 상태 처리
* 이벤트 기반 아키텍처
* 채팅방 단위 메시지 전달
* 알림 시스템

# Step 5. Direct Exchange 기반 로그 수집

Direct Exchange를 사용하여 로그 레벨별 Queue로 메시지를 전달한다.

## Queue 구성

```text id="3um9nh"
error.queue
warn.queue
info.queue
```

## 개발 흐름

1. Queue 및 Direct Exchange 설정
2. Binding 설정
3. LogPublisher 생성
4. LogConsumer 생성
5. Exception 발생 시 로그 발행
6. REST API 테스트

## 예시 요청

```bash
curl -X GET "http://localhost:8080/api/logs/error"
```

```bash
curl -X GET "http://localhost:8080/api/logs/warn"
```

```bash
curl -X POST "http://localhost:8080/api/logs/info" \
     -H "Content-Type: application/json" \
     -d "\"System initialized successfully.\""
```


# Step 6. Topic Exchange 기반 패턴 로그 수집

Topic Exchange를 사용해 패턴 기반으로 로그를 수집한다.

## 예시 Routing Key

```text id="m3kpca"
log.error
log.warn
log.info
```

---

## 모든 로그 수집 Queue

Binding Key:

```text id="4u8ibm"
log.#
```

## 특징

* 특정 로그만 수집 가능
* 모든 로그 동시 수집 가능
* 여러 Queue에 동시 전달 가능
* 이벤트 기반 구조에 적합

# 핵심 정리

| Exchange | 특징                 |
| -------- | ------------------ |
| Direct   | 정확한 Routing Key 매칭 |
| Topic    | 패턴 기반 매칭           |
| Fanout   | 모든 Queue 브로드캐스트    |
| Headers  | Header 기반 라우팅      |


# 핵심 개념

Producer는:

* Exchange 이름
* Routing Key

만 알고 메시지를 발행한다.

실제 Queue 선택은:

* Exchange
* Binding Key

가 결정한다.
