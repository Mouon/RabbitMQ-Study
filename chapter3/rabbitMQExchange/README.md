# RabbitMQ Exchange 종류 정리

RabbitMQ에서 Producer는 Queue에 직접 메시지를 보내지 않고, Exchange로 메시지를 전달한다.
Exchange는 Binding 규칙과 Routing Key를 기준으로 어떤 Queue로 메시지를 전달할지 결정한다.

```text id="j8fg6x"
Producer → Exchange → Queue → Consumer
```


## 1. Direct Exchange

Routing Key가 정확히 일치하는 Queue로 메시지를 전달한다.

```text id="afw7mi"
order.created → order.queue
```

특징:

* 정확한 Routing Key 매칭
* 특정 Queue로 명확하게 전달 가능
* 하나의 Routing Key를 여러 Queue에 바인딩하면 1:N 전달 가능

사용 예시:

* 주문 상태 처리
* 결제 처리
* 알림 처리


## 2. Topic Exchange

Routing Key 패턴 기반으로 메시지를 전달한다.

와일드카드:

* `*` : 단어 하나 대체
* `#` : 단어 여러 개 대체

예시:

```text id="6f26gd"
order.*
payment.#
```

매칭 예시:

```text id="z6l2t9"
order.created
order.cancelled
payment.card.completed
```

특징:

* 유연한 라우팅 가능
* 이벤트 기반 시스템에 적합

사용 예시:

* 로그 수집 시스템
* 이벤트 기반 아키텍처
* MSA 환경

## 3. Fanout Exchange

Binding된 모든 Queue에 메시지를 전달한다.

```text id="oz7p4t"
Message → 모든 Queue
```

특징:

* Routing Key 사용하지 않음
* 브로드캐스트 방식

사용 예시:

* 실시간 알림
* 채팅
* 공지 시스템
* Pub/Sub 모델

PDF에서도 다음 흐름으로 설명한다:

```text id="q2nd0s"
Publisher → Fanout Exchange → 모든 연결된 Queue
```



## 4. Headers Exchange

Routing Key 대신 Header 값을 기준으로 메시지를 전달한다.

예시:

```text id="sjjlwm"
language=ko
grade=vip
```

특징:

* 메시지 메타데이터 기반 라우팅
* 복잡한 조건 처리 가능

사용 예시:

* 다국어 서비스
* 사용자 등급별 알림
* 조건 기반 메시징



# 핵심 비교

| Exchange | 라우팅 기준   | 특징       |
| -------- | -------- | -------- |
| Direct   | 정확한 Key  | 정확한 매칭   |
| Topic    | 패턴       | 유연한 매칭   |
| Fanout   | 전체 전달    | 브로드캐스트   |
| Headers  | Header 값 | 메타데이터 기반 |



# 핵심 개념

Producer는 Queue 이름을 몰라도 된다.

Producer는:

* Exchange 이름
* Routing Key

만 알고 메시지를 발행한다.

실제 Queue 선택은 Exchange와 Binding 규칙이 처리한다.
