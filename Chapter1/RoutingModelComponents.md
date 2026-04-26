## Routing Model Components

AMQP의 라우팅 모델은 아래와 같은 3개의 중요한 component들로 구성된다.

- Exchange
- Queue
- Binding

각 컴포넌트들은 아래의 기능들을 수행한다.

![RoutingModel Components.png](images/RoutingModel%20Components.png)

- Exchange : Publisher로부터 수신한 메시지를 적절한 큐 또는 다른 exchange로 분배하는 라우터의 기능을 한다.
- Queue : 메모리나 디스크에 메시지를 저장하고, 그것을 consumer에게 전달하는 역할을 한다.
- Binding : exchange와 queue와 관계를 정의한 라우팅 테이블이다. 같은 큐가 binding 될 수 있다.
- Routing Key : 발행된 메시지와 큐가 라우팅 테이블을 통해 매칭되는 키를 뜻한다. 일종의 가상주소이다.