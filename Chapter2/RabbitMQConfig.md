### RabbitMQConfig 설정

#### 개요

RabbitMQConfig는 애플리케이션에서 RabbitMQ를 사용하기 위한 설정 클래스이다.
큐 생성, 메시지 송수신, 메시지 수신 처리까지 메시징에 필요한 구성 요소를 Bean으로 등록한다.
이를 통해 Producer와 Consumer 간의 비동기 메시지 처리 구조를 구성할 수 있다.

---

#### Queue 설정

```java
@Bean
public Queue queue() {
    return new Queue(QUEUE_NAME, false);
}
```

Queue는 메시지가 저장되는 공간이다.
애플리케이션에서 사용할 큐를 정의하며, 메시지 송수신의 기본 단위가 된다.

QUEUE_NAME은 큐의 이름을 의미하며, 해당 이름을 기준으로 메시지가 적재되고 소비된다.
두 번째 파라미터는 큐의 영속성 여부를 결정한다. false로 설정하면 비영속 큐로 동작하며, 서버가 재시작될 경우 큐와 메시지는 사라진다. true로 설정하면 영속 큐로 유지된다.

---

#### RabbitTemplate 설정

```java
@Bean
public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
    return new RabbitTemplate(connectionFactory);
}
```

RabbitTemplate은 RabbitMQ와 통신하기 위한 템플릿 클래스이다.
메시지 전송과 같은 작업을 간단하게 수행할 수 있도록 도와준다.

ConnectionFactory는 RabbitMQ 서버와의 연결을 관리하는 객체이며, RabbitTemplate에 주입되어 실제 메시지 송수신 시 사용된다.

메시지 전송은 다음과 같은 방식으로 수행된다.

```java
rabbitTemplate.convertAndSend(QUEUE_NAME, message);
```

---

#### MessageListenerContainer 설정

```java
@Bean
public SimpleMessageListenerContainer container(
        ConnectionFactory connectionFactory,
        MessageListenerAdapter listenerAdapter) {

    SimpleMessageListenerContainer container = new SimpleMessageListenerContainer();
    container.setConnectionFactory(connectionFactory);
    container.setQueueNames(QUEUE_NAME);
    container.setMessageListener(listenerAdapter);
    return container;
}
```

SimpleMessageListenerContainer는 RabbitMQ의 메시지를 비동기적으로 수신하기 위한 컴포넌트이다.
지정된 큐를 지속적으로 모니터링하다가 메시지가 도착하면 자동으로 이를 처리한다.

ConnectionFactory를 통해 RabbitMQ와 연결을 유지하며, setQueueNames를 통해 수신 대상 큐를 지정한다.
setMessageListener를 통해 메시지를 처리할 리스너를 연결한다.

---

#### MessageListenerAdapter 설정

```java
@Bean
public MessageListenerAdapter listenerAdapter(Receiver receiver) {
    return new MessageListenerAdapter(receiver, "receiveMessage");
}
```

MessageListenerAdapter는 수신된 메시지를 특정 객체의 메서드로 전달하는 역할을 한다.
Receiver는 실제 메시지를 처리하는 클래스이며, receiveMessage 메서드를 호출하도록 설정된다.

메시지가 수신되면 MessageListenerAdapter가 이를 받아 Receiver의 receiveMessage 메서드로 전달하고, 해당 메서드에서 메시지를 처리하게 된다.

---

#### 전체 동작 흐름

메시지는 RabbitTemplate을 통해 큐로 전송된다.
큐에 저장된 메시지는 SimpleMessageListenerContainer가 감지하여 수신한다.
수신된 메시지는 MessageListenerAdapter를 통해 Receiver 객체의 메서드로 전달되며, 최종적으로 비즈니스 로직에서 처리된다.

---

#### 정리

Queue는 메시지를 저장하는 역할을 한다.
RabbitTemplate은 메시지를 전송하는 역할을 한다.
SimpleMessageListenerContainer는 메시지를 수신하는 역할을 한다.
MessageListenerAdapter는 수신된 메시지를 특정 메서드로 연결해준다.
Receiver는 실제 메시지를 처리하는 비즈니스 로직을 담당한다.

이 구성을 통해 RabbitMQ 기반의 비동기 메시지 처리 구조를 구현할 수 있다.
