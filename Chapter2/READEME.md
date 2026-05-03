# RabbitMQ 학습 정리

## Step 2. Work Queue

### 핵심

- 여러 Consumer가 같은 큐를 같이 본다.
- 메시지는 여러 Consumer 중 하나만 가져가서 처리한다.
- 그래서 작업이 분산된다.
- Consumer를 여러 개 띄우면 병렬 처리 구조가 된다.

### 현재 코드 기준 정리

- 큐 이름은 `WorkQueue`
- 큐는 `durable=true`
- Listener는 `workQueueTask` 메서드에 연결
- ACK 모드는 `AcknowledgeMode.AUTO`
- Producer는 `message| duration` 형태로 보냄
- Consumer는 `|` 기준으로 나눠서 `duration`을 파싱한 뒤 작업 시간을 흉내 낸다

## Round-Robin

- 기본 분배 방식
- Consumer가 여러 개 있으면 메시지를 순서대로 나눠준다
- 별도 설정 없이도 기본적으로 이 흐름을 볼 수 있다
- 현재 예제는 `AUTO ACK` 상태에서 이 패턴을 확인하는 용도에 가깝다

## Fair Dispatch

- 작업 시간이 제각각일 때 Round-Robin만으로는 비효율이 생길 수 있다
- 오래 걸리는 작업을 잡은 Consumer에도 다음 메시지가 순서상 계속 갈 수 있기 때문
- 이걸 보완하려면 `MANUAL ACK`와 `prefetchCount`를 같이 본다

### 같이 기억할 것

- `MANUAL ACK`: 직접 처리 완료 신호를 보낸다
- `prefetchCount`: Consumer가 한 번에 가져갈 메시지 수를 제한한다
- 먼저 처리 끝낸 Consumer가 다음 메시지를 더 빨리 받게 만들 수 있다

## ACK 모드

- `AUTO`: 리스너가 정상 종료되면 자동 ACK
- `MANUAL`: 직접 ACK
- `NONE`: ACK 사용 안 함

### 공부 포인트

- 지금 단계에서는 `AUTO`로 흐름 이해
- 다음 단계로는 `MANUAL ACK` + `prefetchCount` 조합까지 같이 보는 게 중요

## `ready` / `unacked`

RabbitMQ 관리 화면에서 가장 먼저 볼 상태값이다.

### ready

- 큐에 쌓여 있지만 아직 Consumer에게 안 간 메시지
- Consumer가 느리거나 부족하면 증가

### unacked

- Consumer에게 전달은 되었지만 아직 ACK 안 된 메시지
- 처리 중일 수도 있고, 에러가 나서 ACK를 못 보내는 중일 수도 있다

### 해석

- `ready`가 많다: 메시지가 밀리고 있음
- `unacked`가 많다: Consumer 로직이나 ACK 흐름 확인 필요

## 에러로 확인한 포인트

- `duration` 파싱이 실패하면 `NumberFormatException` 발생 가능
- 이런 경우 `ListenerExecutionFailedException`으로 보일 수 있다
- 처리 실패 시 큐 상태가 어떻게 보이는지 같이 확인하는 게 중요하다

## purge 정리

- purge는 보통 `ready` 메시지를 비운다
- `unacked` 메시지는 purge로 바로 안 지워질 수 있다
- Consumer 연결 종료나 재시작 후 다시 `ready`로 돌아오는 흐름까지 봐야 한다

## 테스트 메모

```bash
curl -X POST "http://localhost:8080/api/workqueue?message=Task1&duration=2000"
curl -X POST "http://localhost:8080/api/workqueue?message=Task2&duration=4000"
curl -X POST "http://localhost:8080/api/workqueue?message=Task3&duration=5000"
```

### 볼 것

- 여러 앱 인스턴스를 띄웠을 때 어떤 Consumer가 어떤 작업을 가져가는지
- 처리 시간이 긴 작업이 있을 때 분배가 어떻게 보이는지
- 에러 발생 시 `ready`, `unacked`가 어떻게 변하는지

## 실행 메모

```bash
./gradlew clean build
java -jar build/libs/HelloMQ-0.0.1-SNAPSHOT.jar --server.port=8080
java -jar build/libs/HelloMQ-0.0.1-SNAPSHOT.jar --server.port=8081
```
