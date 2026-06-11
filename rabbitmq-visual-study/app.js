const CHAPTER_IDS = ["chapter-1", "chapter-2", "chapter-3", "chapter-5"];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  chapter1: {
    seq: 0,
    ready: [],
    consumed: 0,
    busy: false,
  },
  chapter2: {
    seq: 0,
    ready: [],
    unacked: [],
    failed: 0,
    processed: { A: 0, B: 0 },
    mode: "round",
    pointer: 0,
    busy: false,
  },
  chapter3: {
    seq: 0,
    type: "direct",
    routed: 0,
    source: 0,
    dlq: 0,
    queues: {
      error: 0,
      warn: 0,
      info: 0,
      all: 0,
    },
    busy: false,
  },
  chapter5: {
    sync: {
      members: 2,
      result: "대기",
      serverA: "대기 중",
      serverB: "대기 중",
      lockA: "Server A JVM",
      lockB: "Server B JVM",
      shared: "서버 밖 공통 락 없음",
    },
    reentrant: {
      members: 2,
      result: "대기",
      serverA: "Lock Map A 대기",
      serverB: "Lock Map B 대기",
      lockA: "free",
      lockB: "free",
      shared: "서버 밖 공통 락 없음",
    },
    redis: {
      members: 2,
      result: "대기",
      serverA: "대기 중",
      serverB: "대기 중",
      lock: "free",
    },
    busy: false,
  },
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindActions();
  syncChapterFromHash();
  renderAll();
  addLog("chapter1", "Chapter 1은 메시지가 Exchange를 거쳐 Queue에 저장되는 흐름부터 시작합니다.");
  addLog("chapter2", "Chapter 2는 같은 Queue를 여러 Consumer가 나눠 보는 상황을 관찰합니다.");
  addLog("chapter3", "Chapter 3은 Exchange 타입과 DLQ 이동 조건을 직접 눌러 확인합니다.");
  addLog("sync", "synchronized는 하나의 JVM 안에서 monitor lock으로 임계 영역을 막습니다.");
  addLog("reentrant", "ReentrantLock은 roomId별 락을 관리할 수 있지만 그 Lock Map은 JVM마다 따로 존재합니다.");
  addLog("redis", "Redis 분산락은 여러 Spring 서버가 같은 lock key를 바라보게 만듭니다.");
});

function bindNavigation() {
  const select = document.querySelector("#chapterSelect");
  select.addEventListener("change", (event) => {
    setActiveChapter(event.target.value, true);
  });
  window.addEventListener("hashchange", syncChapterFromHash);
}

function syncChapterFromHash() {
  const hash = window.location.hash.replace("#", "");
  const chapterId = CHAPTER_IDS.includes(hash) ? hash : "chapter-1";
  setActiveChapter(chapterId, false);
}

function setActiveChapter(chapterId, shouldPush) {
  const current = document.querySelector(".chapter-section.is-active")?.id;
  const changed = current !== chapterId;

  document.querySelectorAll(".chapter-section").forEach((section) => {
    section.classList.toggle("is-active", section.id === chapterId);
  });

  const select = document.querySelector("#chapterSelect");
  if (select.value !== chapterId) {
    select.value = chapterId;
  }

  if (shouldPush && window.location.hash !== `#${chapterId}`) {
    history.pushState(null, "", `#${chapterId}`);
  }

  if (changed) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }
}

function bindActions() {
  document.addEventListener("click", async (event) => {
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      setWorkMode(modeButton.dataset.mode);
      return;
    }

    const exchangeButton = event.target.closest("[data-exchange]");
    if (exchangeButton) {
      setExchangeType(exchangeButton.dataset.exchange);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;
    if (action.startsWith("reset")) {
      actions[action]();
      return;
    }

    const chapterKey = actionChapterMap[action];
    if (!chapterKey || state[chapterKey].busy) {
      return;
    }

    await withBusy(chapterKey, actions[action]);
  });
}

const actionChapterMap = {
  "ch1-publish": "chapter1",
  "ch1-consume": "chapter1",
  "ch2-short": "chapter2",
  "ch2-mixed": "chapter2",
  "ch2-error": "chapter2",
  "ch3-publish": "chapter3",
  "ch3-dlq": "chapter3",
  "ch3-ttl": "chapter3",
  "sync-local": "chapter5",
  "sync-multi": "chapter5",
  "reentrant-multi": "chapter5",
  "reentrant-timeout": "chapter5",
  "redis-distributed": "chapter5",
  "redis-failover": "chapter5",
};

const actions = {
  "ch1-publish": publishChapter1Message,
  "ch1-consume": consumeChapter1Message,
  "reset-ch1": resetChapter1,
  "ch2-short": runShortWorkQueue,
  "ch2-mixed": runMixedWorkQueue,
  "ch2-error": runWorkQueueError,
  "reset-ch2": resetChapter2,
  "ch3-publish": publishExchangeMessage,
  "ch3-dlq": runDlqFailure,
  "ch3-ttl": runTtlExpiry,
  "reset-ch3": resetChapter3,
  "sync-local": runSynchronizedLocal,
  "sync-multi": runSynchronizedMultiServer,
  "reset-sync": resetSynchronized,
  "reentrant-multi": runReentrantMultiServer,
  "reentrant-timeout": runReentrantTimeout,
  "reset-reentrant": resetReentrant,
  "redis-distributed": runRedisDistributedLock,
  "redis-failover": runRedisFailover,
  "reset-redis": resetRedis,
};

async function withBusy(chapterKey, task) {
  state[chapterKey].busy = true;
  setLabBusy(chapterKey, true);
  try {
    await task();
  } finally {
    state[chapterKey].busy = false;
    setLabBusy(chapterKey, false);
  }
}

function setLabBusy(chapterKey, busy) {
  const chapterId = chapterKey.replace("chapter", "chapter-");
  const labs = document.querySelectorAll(`#${chapterId} .lab, #${chapterId} .inline-lab`);
  labs.forEach((lab) => {
    lab.querySelectorAll("button, select").forEach((control) => {
      control.disabled = busy;
    });
  });
}


async function publishChapter1Message() {
  const chapter = state.chapter1;
  const message = {
    id: ++chapter.seq,
    label: `M${chapter.seq}`,
  };

  addLog("chapter1", `Producer가 ${message.label}을 발행했습니다.`);
  await animateToken("chapter1", "ch1-producer", "ch1-exchange", message.label);
  addLog("chapter1", "Exchange가 Binding 규칙을 확인했습니다.");
  await animateToken("chapter1", "ch1-exchange", "ch1-queue", message.label);

  chapter.ready.push(message);
  renderChapter1();
  addLog("chapter1", `${message.label}이 order.queue에 ready 상태로 저장됐습니다.`);
}

async function consumeChapter1Message() {
  const chapter = state.chapter1;
  if (chapter.ready.length === 0) {
    addLog("chapter1", "Queue가 비어 있습니다. 먼저 메시지를 발행해 보세요.");
    return;
  }

  const message = chapter.ready.shift();
  renderChapter1();
  await animateToken("chapter1", "ch1-queue", "ch1-consumer", message.label);
  chapter.consumed += 1;
  renderChapter1();
  addLog("chapter1", `Consumer가 ${message.label}을 가져가 처리했습니다.`);
  await animateToken("chapter1", "ch1-consumer", "ch1-producer", "ACK", { variant: "ack", duration: 720 });
}

function resetChapter1() {
  state.chapter1.seq = 0;
  state.chapter1.ready = [];
  state.chapter1.consumed = 0;
  clearLog("chapter1");
  renderChapter1();
  addLog("chapter1", "Chapter 1 상태를 초기화했습니다.");
}

function setWorkMode(mode) {
  if (!["round", "fair"].includes(mode) || state.chapter2.busy) {
    return;
  }

  state.chapter2.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.mode === mode);
  });

  const label = mode === "round" ? "Round-Robin" : "Fair Dispatch";
  addLog("chapter2", `${label} 모드로 전환했습니다.`);
}

async function runShortWorkQueue() {
  const tasks = [
    createTask("T1", 360),
    createTask("T2", 360),
    createTask("T3", 360),
    createTask("T4", 360),
  ];

  addLog("chapter2", "짧은 작업 4개를 WorkQueue에 넣습니다.");
  for (const task of tasks) {
    await enqueueWorkTask(task);
  }

  for (const task of tasks) {
    const consumer = nextRoundRobinConsumer();
    await deliverTaskToConsumer(consumer, task);
    await completeTask(consumer, task);
  }
}

async function runMixedWorkQueue() {
  const tasks = [
    createTask("LONG", 1050),
    createTask("S1", 280),
    createTask("S2", 280),
    createTask("S3", 280),
  ];

  addLog("chapter2", "긴 작업 1개와 짧은 작업 3개를 WorkQueue에 넣습니다.");
  for (const task of tasks) {
    await enqueueWorkTask(task);
  }

  if (state.chapter2.mode === "fair") {
    addLog("chapter2", "Fair Dispatch는 prefetch=1처럼 먼저 빈 Consumer에게 다음 작업을 줍니다.");
    await deliverTaskToConsumer("A", tasks[0]);
    await deliverTaskToConsumer("B", tasks[1]);
    await completeTask("B", tasks[1]);
    await deliverTaskToConsumer("B", tasks[2]);
    await completeTask("B", tasks[2]);
    await deliverTaskToConsumer("B", tasks[3]);
    await completeTask("B", tasks[3]);
    await completeTask("A", tasks[0]);
    return;
  }

  addLog("chapter2", "Round-Robin은 처리 시간보다 순서를 먼저 봅니다.");
  await deliverTaskToConsumer("A", tasks[0]);
  await deliverTaskToConsumer("B", tasks[1]);
  await completeTask("B", tasks[1]);
  await deliverTaskToConsumer("A", tasks[2]);
  await deliverTaskToConsumer("B", tasks[3]);
  await completeTask("B", tasks[3]);
  await completeTask("A", tasks[0]);
  await completeTask("A", tasks[2]);
}

async function runWorkQueueError() {
  const task = createTask("BAD", 0, true);
  addLog("chapter2", "duration 파싱이 실패하는 메시지를 보냅니다.");
  await enqueueWorkTask(task);
  await deliverTaskToConsumer("A", task);
  state.chapter2.failed += 1;
  renderChapter2();
  addLog("chapter2", "Consumer A에서 NumberFormatException 흐름이 발생했습니다. ACK가 돌아오지 않은 메시지는 unacked로 관찰됩니다.");
}

function resetChapter2() {
  state.chapter2.seq = 0;
  state.chapter2.ready = [];
  state.chapter2.unacked = [];
  state.chapter2.failed = 0;
  state.chapter2.processed = { A: 0, B: 0 };
  state.chapter2.pointer = 0;
  clearLog("chapter2");
  renderChapter2();
  addLog("chapter2", "Chapter 2 상태를 초기화했습니다.");
}

function createTask(label, duration, isError = false) {
  const chapter = state.chapter2;
  return {
    id: ++chapter.seq,
    label,
    duration,
    error: isError,
  };
}

async function enqueueWorkTask(task) {
  state.chapter2.ready.push(task);
  renderChapter2();
  await animateToken("chapter2", "ch2-producer", "ch2-queue", task.label, {
    variant: task.error ? "error" : "",
    duration: 760,
  });
}

async function deliverTaskToConsumer(consumer, task) {
  const chapter = state.chapter2;
  const index = chapter.ready.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    chapter.ready.splice(index, 1);
  }
  chapter.unacked.push({ ...task, consumer });
  renderChapter2();

  await animateToken("chapter2", "ch2-queue", `ch2-consumer-${consumer.toLowerCase()}`, task.label, {
    variant: task.error ? "error" : "",
    duration: 900,
  });
  addLog("chapter2", `${task.label}이 Consumer ${consumer}에게 전달되어 unacked가 증가했습니다.`);
}

async function completeTask(consumer, task) {
  await sleep(task.duration);
  await animateToken("chapter2", `ch2-consumer-${consumer.toLowerCase()}`, "ch2-ack", "ACK", {
    variant: "ack",
    duration: 680,
  });

  const chapter = state.chapter2;
  chapter.unacked = chapter.unacked.filter((item) => item.id !== task.id);
  chapter.processed[consumer] += 1;
  renderChapter2();
  addLog("chapter2", `Consumer ${consumer}가 ${task.label} 처리를 끝내고 ACK를 보냈습니다.`);
}

function nextRoundRobinConsumer() {
  const consumers = ["A", "B"];
  const consumer = consumers[state.chapter2.pointer % consumers.length];
  state.chapter2.pointer += 1;
  return consumer;
}

function setExchangeType(type) {
  if (!["direct", "topic", "fanout"].includes(type) || state.chapter3.busy) {
    return;
  }

  state.chapter3.type = type;
  document.querySelectorAll("[data-exchange]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.exchange === type);
  });
  renderExchangeLabels();
  addLog("chapter3", `${typeLabel(type)} Exchange 모드로 전환했습니다.`);
}

async function publishExchangeMessage() {
  const chapter = state.chapter3;
  const routingKey = document.querySelector("#routingKey").value;
  const label = shortKey(routingKey);

  addLog("chapter3", `Producer가 routing key ${routingKey}로 메시지를 발행했습니다.`);
  await animateToken("chapter3", "ch3-producer", "ch3-exchange", label);

  const targets = resolveTargets(chapter.type, routingKey);
  if (targets.length === 0) {
    await animateToken("chapter3", "ch3-exchange", "ch3-drop", "drop", { variant: "error" });
    addLog("chapter3", "매칭된 Binding이 없어 어떤 Queue에도 저장되지 않았습니다.");
    return;
  }

  for (const target of targets) {
    await animateToken("chapter3", "ch3-exchange", `ch3-${target}`, label);
    chapter.queues[target] += 1;
    chapter.routed += 1;
    renderChapter3();
    addLog("chapter3", `${routingKey} 메시지가 ${queueName(target)}에 저장됐습니다.`);
  }
}

async function runDlqFailure() {
  const chapter = state.chapter3;
  const label = `P${++chapter.seq}`;

  chapter.source += 1;
  renderChapter3();
  addLog("chapter3", `${label}이 payment.queue에 들어왔습니다.`);
  await animateToken("chapter3", "ch3-producer", "ch3-source", label);

  chapter.source -= 1;
  renderChapter3();
  await animateToken("chapter3", "ch3-source", "ch3-consumer", label);
  addLog("chapter3", `Consumer가 ${label} 처리에 실패하고 nack(requeue=false)를 보냈습니다.`);

  await animateToken("chapter3", "ch3-consumer", "ch3-dlx", "nack", { variant: "error" });
  await animateToken("chapter3", "ch3-dlx", "ch3-dlq", label, { variant: "error" });

  chapter.dlq += 1;
  renderChapter3();
  addLog("chapter3", `${label}이 DLX를 거쳐 dead.queue에 저장됐습니다.`);
}

async function runTtlExpiry() {
  const chapter = state.chapter3;
  const label = `TTL${++chapter.seq}`;

  chapter.source += 1;
  renderChapter3();
  addLog("chapter3", `${label}이 payment.queue에 저장됐지만 TTL이 만료됩니다.`);
  await animateToken("chapter3", "ch3-producer", "ch3-source", label);
  await sleep(320);

  chapter.source -= 1;
  renderChapter3();
  await animateToken("chapter3", "ch3-source", "ch3-dlx", "expired", { variant: "error" });
  await animateToken("chapter3", "ch3-dlx", "ch3-dlq", label, { variant: "error" });

  chapter.dlq += 1;
  renderChapter3();
  addLog("chapter3", `${label}은 consumer 실패 없이도 TTL 만료 조건으로 DLQ에 이동했습니다.`);
}

function resetChapter3() {
  state.chapter3.seq = 0;
  state.chapter3.routed = 0;
  state.chapter3.source = 0;
  state.chapter3.dlq = 0;
  state.chapter3.queues = { error: 0, warn: 0, info: 0, all: 0 };
  clearLog("chapter3");
  renderChapter3();
  addLog("chapter3", "Chapter 3 상태를 초기화했습니다.");
}

async function runSynchronizedLocal() {
  resetSynchronizedSurface("Server A 한 대 안으로 두 요청이 들어옵니다.");
  const sync = state.chapter5.sync;
  sync.serverA = "thread-1 monitor 획득";
  sync.lockA = "locked by thread-1";
  sync.lockB = "다른 서버 락";
  renderChapter5();
  await animateToken("sync", "sync-user-a", "sync-server-a", "HTTP", { duration: 1500 });
  await animateToken("sync", "sync-server-a", "sync-lock-a", "lock", { variant: "ack", duration: 1500 });
  await animateToken("sync", "sync-server-a", "sync-db", "INSERT", { duration: 1600 });
  sync.members = 3;
  sync.result = "첫 요청 입장";
  sync.lockA = "thread-2 대기 중";
  sync.serverA = "thread-2 monitor 대기";
  renderChapter5();
  addLog("sync", "thread-1이 monitor lock을 잡고 validateHeadCount와 INSERT를 먼저 끝냅니다.");
  await animateToken("sync", "sync-user-b", "sync-server-a", "HTTP", { duration: 1500 });
  await animateToken("sync", "sync-server-a", "sync-lock-a", "WAIT", { variant: "error", duration: 1600 });
  sync.lockA = "unlocked";
  sync.serverA = "thread-2 재검증 후 거절";
  sync.result = "정원 초과 방지";
  renderChapter5();
  addLog("sync", "같은 JVM 안에서는 두 번째 요청이 기다렸다가 정원 3/3을 다시 보고 거절됩니다.");
}

async function runSynchronizedMultiServer() {
  resetSynchronizedSurface("로드밸런서가 요청을 Server A와 Server B로 나눠 보냅니다.");
  const sync = state.chapter5.sync;
  sync.serverA = "thread-1 monitor 획득";
  sync.serverB = "thread-8 자기 monitor 획득";
  sync.lockA = "Server A acquired";
  sync.lockB = "Server B acquired";
  sync.shared = "공유 락 없음";
  renderChapter5();
  await animateToken("sync", "sync-user-a", "sync-server-a", "HTTP A", { duration: 1500 });
  await animateToken("sync", "sync-user-b", "sync-server-b", "HTTP B", { duration: 1500 });
  await animateToken("sync", "sync-server-a", "sync-lock-a", "lock A", { variant: "ack", duration: 1400 });
  await animateToken("sync", "sync-server-b", "sync-lock-b", "lock B", { variant: "ack", duration: 1400 });
  await animateToken("sync", "sync-shared", "sync-db", "no guard", { variant: "error", duration: 1600 });
  await animateToken("sync", "sync-server-b", "sync-db", "INSERT", { variant: "error", duration: 1700 });
  sync.members = 4;
  sync.result = "서버 간 정원 초과 위험";
  renderChapter5();
  addLog("sync", "Server B의 JVM monitor는 Server A의 monitor와 다른 객체라 서로 기다리지 않습니다.");
}

function resetSynchronizedSurface(message) {
  const sync = state.chapter5.sync;
  sync.members = 2;
  sync.result = "진행 중";
  sync.serverA = "대기 중";
  sync.serverB = "대기 중";
  sync.lockA = "Server A JVM";
  sync.lockB = "Server B JVM";
  sync.shared = "서버 밖 공통 락 없음";
  renderChapter5();
  addLog("sync", message);
}

function resetSynchronized() {
  clearLog("sync");
  resetSynchronizedSurface("synchronized 액션을 초기화했습니다.");
}

async function runReentrantMultiServer() {
  resetReentrantSurface("Server A와 Server B가 같은 studyroom:1 락을 만든 것처럼 보이지만, 실제로는 각 JVM 안의 다른 락입니다.");
  const reentrant = state.chapter5.reentrant;
  reentrant.serverA = "locks.get(1) 요청";
  reentrant.serverB = "locks.get(1) 요청";
  reentrant.lockA = "Server A acquired";
  reentrant.lockB = "Server B acquired";
  renderChapter5();
  await animateToken("reentrant", "reentrant-user-a", "reentrant-server-a", "HTTP A", { duration: 1500 });
  await animateToken("reentrant", "reentrant-user-b", "reentrant-server-b", "HTTP B", { duration: 1500 });
  await animateToken("reentrant", "reentrant-server-a", "reentrant-lock-a", "lock:1", { variant: "ack", duration: 1500 });
  await animateToken("reentrant", "reentrant-server-b", "reentrant-lock-b", "lock:1", { variant: "ack", duration: 1500 });
  await animateToken("reentrant", "reentrant-shared", "reentrant-db", "no guard", { variant: "error", duration: 1500 });
  await animateToken("reentrant", "reentrant-server-a", "reentrant-db", "INSERT", { duration: 1550 });
  await animateToken("reentrant", "reentrant-server-b", "reentrant-db", "INSERT", { variant: "error", duration: 1550 });
  reentrant.members = 4;
  reentrant.result = "서버 간 정원 초과 위험";
  renderChapter5();
  addLog("reentrant", "두 서버 모두 studyroom:1이라는 이름의 락을 잡았지만, 각자의 JVM 메모리 안 락이라 서로를 막지 못합니다.");
}

async function runReentrantTimeout() {
  resetReentrantSurface("같은 서버 안에서는 같은 Lock Map을 보므로 tryLock 대기시간을 둘 수 있습니다.");
  const reentrant = state.chapter5.reentrant;
  reentrant.serverA = "thread-1 tryLock 성공";
  reentrant.serverB = "같은 서버로 들어온 thread-2";
  reentrant.lockA = "locked by thread-1";
  reentrant.lockB = "다른 서버 락 아님";
  reentrant.shared = "공유 락 없음";
  renderChapter5();
  await animateToken("reentrant", "reentrant-user-a", "reentrant-server-a", "HTTP", { duration: 1500 });
  await animateToken("reentrant", "reentrant-server-a", "reentrant-lock-a", "lock", { variant: "ack", duration: 1500 });
  await animateToken("reentrant", "reentrant-user-b", "reentrant-server-a", "same JVM", { duration: 1500 });
  await animateToken("reentrant", "reentrant-server-a", "reentrant-lock-a", "WAIT 2s", { variant: "error", duration: 1900 });
  reentrant.lockA = "timeout or retry";
  reentrant.result = "무한 대기 대신 실패 처리";
  renderChapter5();
  addLog("reentrant", "ReentrantLock의 tryLock timeout은 한 JVM 안의 대기 제어에는 좋지만, 다른 서버의 Lock Map까지 제어하지는 못합니다.");
}

function resetReentrantSurface(message) {
  const reentrant = state.chapter5.reentrant;
  reentrant.members = 2;
  reentrant.result = "진행 중";
  reentrant.serverA = "Lock Map A 대기";
  reentrant.serverB = "Lock Map B 대기";
  reentrant.lockA = "free";
  reentrant.lockB = "free";
  reentrant.shared = "서버 밖 공통 락 없음";
  renderChapter5();
  addLog("reentrant", message);
}

function resetReentrant() {
  clearLog("reentrant");
  resetReentrantSurface("ReentrantLock 액션을 초기화했습니다.");
}

async function runRedisDistributedLock() {
  resetRedisSurface("Server A와 Server B가 같은 Redis key를 두고 경쟁합니다.");
  const redis = state.chapter5.redis;
  redis.serverA = "RLock 요청";
  redis.serverB = "RLock 요청";
  redis.lock = "Server A acquired";
  renderChapter5();
  await animateToken("redis", "redis-user-a", "redis-server-a", "HTTP A", { duration: 1500 });
  await animateToken("redis", "redis-user-b", "redis-server-b", "HTTP B", { duration: 1500 });
  await animateToken("redis", "redis-server-a", "redis-center", "SET NX", { variant: "ack", duration: 1700 });
  await animateToken("redis", "redis-server-b", "redis-center", "WAIT", { variant: "error", duration: 1800 });
  await animateToken("redis", "redis-server-a", "redis-db", "INSERT", { duration: 1700 });
  redis.members = 3;
  redis.serverA = "unlock";
  redis.serverB = "lock 획득 후 재검증";
  redis.lock = "Server B acquired";
  renderChapter5();
  await animateToken("redis", "redis-center", "redis-server-b", "LOCK", { variant: "ack", duration: 1500 });
  redis.result = "분산 환경에서 정원 보호";
  redis.serverB = "정원 3/3 확인 후 거절";
  renderChapter5();
  addLog("redis", "두 서버가 같은 Redis studyroomLock:1 키를 보기 때문에 Server B는 기다렸다가 재검증합니다.");
}

async function runRedisFailover() {
  resetRedisSurface("분산락은 Redis 장애와 lease time도 같이 설계해야 합니다.");
  const redis = state.chapter5.redis;
  redis.serverA = "lock 획득 후 처리 중";
  redis.lock = "lease time ticking";
  renderChapter5();
  await animateToken("redis", "redis-server-a", "redis-center", "LOCK 10s", { variant: "ack", duration: 1600 });
  await animateToken("redis", "redis-center", "redis-server-b", "WAIT", { variant: "error", duration: 1800 });
  redis.lock = "expired or Redis unavailable";
  redis.serverB = "재시도/실패 정책 필요";
  redis.result = "운영 안전장치 필요";
  renderChapter5();
  addLog("redis", "finally unlock, lease time, Redis 장애 시 fallback 정책까지 있어야 분산락을 안전하게 쓸 수 있습니다.");
}

function resetRedisSurface(message) {
  const redis = state.chapter5.redis;
  redis.members = 2;
  redis.result = "진행 중";
  redis.serverA = "대기 중";
  redis.serverB = "대기 중";
  redis.lock = "free";
  renderChapter5();
  addLog("redis", message);
}

function resetRedis() {
  clearLog("redis");
  resetRedisSurface("Redis 분산락 액션을 초기화했습니다.");
}

function resolveTargets(type, routingKey) {
  if (type === "fanout") {
    return ["error", "warn", "info", "all"];
  }

  if (type === "direct") {
    const directMap = {
      "log.error": ["error"],
      "log.warn": ["warn"],
      "log.info": ["info"],
    };
    return directMap[routingKey] || [];
  }

  const targets = [];
  if (topicMatches("#.error", routingKey)) {
    targets.push("error");
  }
  if (topicMatches("log.warn", routingKey)) {
    targets.push("warn");
  }
  if (topicMatches("log.info", routingKey)) {
    targets.push("info");
  }
  if (topicMatches("log.#", routingKey) || topicMatches("order.#", routingKey)) {
    targets.push("all");
  }
  return targets;
}

function topicMatches(pattern, key) {
  const patternParts = pattern.split(".");
  const keyParts = key.split(".");

  function match(patternIndex, keyIndex) {
    if (patternIndex === patternParts.length && keyIndex === keyParts.length) {
      return true;
    }
    if (patternIndex === patternParts.length) {
      return false;
    }

    const current = patternParts[patternIndex];
    if (current === "#") {
      for (let nextIndex = keyIndex; nextIndex <= keyParts.length; nextIndex += 1) {
        if (match(patternIndex + 1, nextIndex)) {
          return true;
        }
      }
      return false;
    }

    if (keyIndex >= keyParts.length) {
      return false;
    }

    if (current === "*" || current === keyParts[keyIndex]) {
      return match(patternIndex + 1, keyIndex + 1);
    }

    return false;
  }

  return match(0, 0);
}

function renderAll() {
  renderChapter1();
  renderChapter2();
  renderChapter3();
  renderChapter5();
  renderExchangeLabels();
}

function renderChapter1() {
  setCount("ch1-ready", state.chapter1.ready.length);
  setCount("ch1-consumed", state.chapter1.consumed);
  renderStack("ch1-queue", state.chapter1.ready.map((message) => message.label));
}

function renderChapter2() {
  const chapter = state.chapter2;
  setCount("ch2-ready", chapter.ready.length);
  setCount("ch2-unacked", chapter.unacked.length);
  setCount("ch2-failed", chapter.failed);
  renderStack("ch2-queue", chapter.ready.map((task) => task.label), {
    errorIds: chapter.ready.filter((task) => task.error).map((task) => task.label),
  });

  ["A", "B"].forEach((consumer) => {
    const load = chapter.unacked.filter((task) => task.consumer === consumer).length;
    const status = load > 0 ? `${load} unacked` : "idle";
    setText(`[data-consumer="${consumer}-status"]`, status);
    setText(`[data-consumer="${consumer}-count"]`, chapter.processed[consumer]);
  });
}

function renderChapter3() {
  const chapter = state.chapter3;
  setCount("ch3-routed", chapter.routed);
  setCount("ch3-source", chapter.source);
  setCount("ch3-dlq", chapter.dlq);

  renderStack("ch3-error", makeStackLabels(chapter.queues.error, "error"), {
    errorIds: makeStackLabels(chapter.queues.error, "error"),
  });
  renderStack("ch3-warn", makeStackLabels(chapter.queues.warn, "warn"));
  renderStack("ch3-info", makeStackLabels(chapter.queues.info, "info"));
  renderStack("ch3-all", makeStackLabels(chapter.queues.all, "msg"));
  renderStack("ch3-source", makeStackLabels(chapter.source, "pay"));
  renderStack("ch3-dlq", makeStackLabels(chapter.dlq, "dead"), {
    errorIds: makeStackLabels(chapter.dlq, "dead"),
  });
}

function renderChapter5() {
  const { sync, reentrant, redis } = state.chapter5;

  setText('[data-sync="server-a"]', sync.serverA);
  setText('[data-sync="server-b"]', sync.serverB);
  setText('[data-sync="lock-a"]', sync.lockA);
  setText('[data-sync="lock-b"]', sync.lockB);
  setText('[data-sync="shared"]', sync.shared);
  setText('[data-sync="db"]', `정원 3명 / 현재 ${Math.min(sync.members, 3)}명${sync.members > 3 ? " + 초과 요청" : ""}`);
  setCount("sync-members", `${sync.members} / 3`);
  setCount("sync-result", sync.result);
  renderSeats("[data-sync-seat]", sync.members);

  setText('[data-reentrant="server-a"]', reentrant.serverA);
  setText('[data-reentrant="server-b"]', reentrant.serverB);
  setText('[data-reentrant="lock-a"]', reentrant.lockA);
  setText('[data-reentrant="lock-b"]', reentrant.lockB);
  setText('[data-reentrant="shared"]', reentrant.shared);
  setText('[data-reentrant="db"]', `정원 3명 / 현재 ${Math.min(reentrant.members, 3)}명${reentrant.members > 3 ? " + 초과 요청" : ""}`);
  setCount("reentrant-members", `${reentrant.members} / 3`);
  setCount("reentrant-result", reentrant.result);
  renderSeats("[data-reentrant-seat]", reentrant.members);

  setText('[data-redis="server-a"]', redis.serverA);
  setText('[data-redis="server-b"]', redis.serverB);
  setText('[data-redis="lock"]', redis.lock);
  setText('[data-redis="db"]', `정원 3명 / 현재 ${Math.min(redis.members, 3)}명`);
  setCount("redis-members", `${redis.members} / 3`);
  setCount("redis-result", redis.result);
  renderSeats("[data-redis-seat]", redis.members);
}

function renderSeats(selector, members) {
  document.querySelectorAll(selector).forEach((seat) => {
    const index = Number(seat.dataset.syncSeat || seat.dataset.reentrantSeat || seat.dataset.redisSeat);
    seat.classList.toggle("is-filled", index <= Math.min(members, 3));
    seat.classList.toggle("is-overflow", members > 3 && index === 3);
  });
}

function renderExchangeLabels() {
  const type = state.chapter3.type;
  setText("[data-exchange-label]", `${type}.exchange`);

  const bindingLabel = {
    direct: "binding key exact match",
    topic: "binding key pattern match",
    fanout: "broadcast to every binding",
  };
  setText("[data-binding-label]", bindingLabel[type]);

  const bindings = {
    direct: {
      error: "log.error",
      warn: "log.warn",
      info: "log.info",
      all: "not bound in direct",
    },
    topic: {
      error: "#.error",
      warn: "log.warn",
      info: "log.info",
      all: "log.# / order.#",
    },
    fanout: {
      error: "fanout binding",
      warn: "fanout binding",
      info: "fanout binding",
      all: "fanout binding",
    },
  };

  Object.entries(bindings[type]).forEach(([key, value]) => {
    setText(`[data-binding="${key}"]`, value);
  });
}

function setCount(name, value) {
  setText(`[data-count="${name}"]`, value);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function renderStack(stackName, labels, options = {}) {
  const stack = document.querySelector(`[data-stack="${stackName}"]`);
  if (!stack) {
    return;
  }

  stack.replaceChildren();
  const visibleLabels = labels.slice(-5);
  const errorIds = new Set(options.errorIds || []);

  visibleLabels.forEach((label) => {
    const pill = document.createElement("span");
    pill.className = `queue-pill${errorIds.has(label) ? " error" : ""}`;
    pill.textContent = label;
    stack.appendChild(pill);
  });

  if (labels.length > visibleLabels.length) {
    const more = document.createElement("span");
    more.className = "queue-pill";
    more.textContent = `+${labels.length - visibleLabels.length}`;
    stack.prepend(more);
  }
}

function makeStackLabels(count, prefix) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

async function animateToken(boardName, fromNode, toNode, label, options = {}) {
  const board = document.querySelector(`[data-board="${boardName}"]`);
  const from = document.querySelector(`[data-node="${fromNode}"]`);
  const to = document.querySelector(`[data-node="${toNode}"]`);
  if (!board || !from || !to) {
    return;
  }

  const token = document.createElement("span");
  token.className = `message-token ${options.variant || ""}`.trim();
  token.textContent = label;
  board.appendChild(token);

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const start = centerOf(from, board, token);
  const end = centerOf(to, board, token);
  token.style.transform = `translate(${start.x}px, ${start.y}px)`;

  if (prefersReducedMotion) {
    token.style.transform = `translate(${end.x}px, ${end.y}px)`;
    await sleep(60);
    token.remove();
    return;
  }

  const animation = token.animate(
    [
      {
        opacity: 0.25,
        transform: `translate(${start.x}px, ${start.y}px) scale(0.92)`,
      },
      {
        opacity: 1,
        offset: 0.16,
        transform: `translate(${start.x}px, ${start.y}px) scale(1)`,
      },
      {
        opacity: 1,
        transform: `translate(${end.x}px, ${end.y}px) scale(1)`,
      },
    ],
    {
      duration: options.duration || 1350,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "forwards",
    },
  );

  try {
    await animation.finished;
  } catch {
    // The animation can be cancelled if the user switches chapters quickly.
  }

  token.remove();
}

function centerOf(node, board, token) {
  const boardRect = board.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  return {
    x: nodeRect.left - boardRect.left + nodeRect.width / 2 - token.offsetWidth / 2,
    y: nodeRect.top - boardRect.top + nodeRect.height / 2 - token.offsetHeight / 2,
  };
}

function addLog(logName, message) {
  const list = document.querySelector(`[data-log="${logName}"]`);
  if (!list) {
    return;
  }

  const item = document.createElement("li");
  item.textContent = message;
  list.prepend(item);

  while (list.children.length > 8) {
    list.lastElementChild.remove();
  }
}

function clearLog(logName) {
  const list = document.querySelector(`[data-log="${logName}"]`);
  if (list) {
    list.replaceChildren();
  }
}

function shortKey(key) {
  const pieces = key.split(".");
  if (pieces.length <= 2) {
    return key;
  }
  return `${pieces[0]}.${pieces[pieces.length - 1]}`;
}

function queueName(target) {
  const names = {
    error: "error.queue",
    warn: "warn.queue",
    info: "info.queue",
    all: "topic.queue",
  };
  return names[target] || target;
}

function typeLabel(type) {
  const labels = {
    direct: "Direct",
    topic: "Topic",
    fanout: "Fanout",
  };
  return labels[type] || type;
}
