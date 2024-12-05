![Group 1](https://github.com/user-attachments/assets/0a330f32-ca85-4ff7-895f-48b242dfcdd8)

<a href="http://www.realticket.store/">
  <img src="https://github.com/user-attachments/assets/9843f504-987b-468c-b951-c2509ce8a958" width="525" alt="Real-Ticket 이용하기(배포 링크)">
</a>

# 🚀 실시간 좌석 예약 서비스

<aside>

예약 가능하다고 믿었는데… 이미 예약 완료? 😟

이제 실시간으로 바뀌는 좌석 상태를 한눈에 확인하세요! 🚀

</aside>

# 🎫 주요 기능

- 자리 선택과 동시에 남에게 뺏길 걱정 NO!
- 실시간으로 바뀌는 예매 현황 조회
![실시간-예매-숏-샘플](https://github.com/user-attachments/assets/0bea6008-1770-4098-a4ce-a25364c36ec8)

---

## 🎯  **개발 목표**

<aside>
🎟️

**끊김 없는 서비스 제공**: 많은 사용자가 동시에 접근해도 안정적으로 실시간 서비스 제공.

</aside>

---

## **🛠️ 문제 해결 과정**

### Server Sent Event를 통한 서버 리소스 절약

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/148dc6c0-b2e7-4d1b-a1d6-8a341d2e80ee" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/3207f889-d086-4648-b80c-6bc5bccb4c84" style="width: 70%;"/>
</div>

- 기존에 선택한 WebSocket을 통한 실시간 통신은 서버가 클라이언트의 요청을 계속해서 수신해야 하기에 서버의 리소스 부담으로 이어진다.
- 서버가 클라이언트에게 일방적으로 데이터를 푸시하는 Server Sent Event로 실시간 통신 방식을 변경한다.
- 서버가 더 이상 클라이언트 요청 수신에 대한 리소스를 낭비하지 않게 된다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/WebSocket-VS-SSE-d8fed9e7c2bc46318b565dc775b6535a?pvs=4)

---
### 데이터 발행 비용 절약을 위한 SSE 브로드캐스팅

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/ac9b0141-d688-422c-a6f2-3d80bac313c1" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/b347e44a-1fe5-48de-9098-7906b16940ec" style="width: 70%;"/>
</div>

- 기존 방식은 클라이언트마다 각각 데이터가 발행돼, 구독자가 늘어남에 따라 오버헤드가 커지는 문제가 있었다.
- 동일한 데이터 소스를 여러 클라이언트가 참조하는 형태의 브로드캐스팅을 구현했다.
- 구독자의 수에 상관 없이 데이터 발행에 드는 비용을 고정적으로 줄일 수 있었다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/SSE-60d6e13d559a4376a7959534b26f7516?pvs=4)

---
### 대기열 도입을 통한 트래픽 과부하 방지

- 다수의 사용자를 좌석 선택 화면에 머물게 하면 서버에 부하가 점차 가중된다.
- 서버에 몰리는 사용자 수에 제한을 걸어 트래픽을 조절하기 위해 대기열 시스템을 도입한다.
- 대기열 도입을 통해서 좌석 선택 페이지에 몰리는 SSE 연결을 조절하여 서버의 안정성을 확보한다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/8800343f85c644eca5dd1e373e4ef4b2?pvs=4)

---
### 상태 관리와 추적을 통한 대기열 누수 방지

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/5a0bff85-cf15-49fe-bcc8-eeb0a352b50b" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/08176f3f-808b-450d-9517-ceaa32d087e2" style="width: 70%;"/>
</div>

- 대기열 화면과 좌석 선택 화면 사이에서 클라이언트의 갖은 예외적 움직임이 발생했고, 대기열 운영에 오류를 일으켰다.
- 변수를 통제하는 방향으로 유저의 상태를 세분하게 정의, 추적, 관리했다.
- 예외적 상황에도 누수 없이 정확한 인원 추적으로 서비스의 무결성을 유지할 수 있게 되었다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/f8278c76f2144c18bc4776a69e1563a7?pvs=4)

---
### 매크로 방지 문자를 통해 부하 분산

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/7146aa41-9eed-46ed-b59e-12f875fc2363" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/fd02af81-48e3-4ce6-a04a-b38a138de3e8" style="width: 70%;"/>
</div>

- 예매 오픈 시 다수의 클라이언트가 동시에 좌석 점유 페이지로 이동해 서버에 과도한 부하가 발생한다.
- 매크로 방지 기능을 사용해 사용자 입력을 요구하여 의도적으로 지연을 발생시킨다.
- 동시에 들어오는 요청을 분산시켜 서버의 안정성을 확보한다.

[[자세히 보기]](https://www.notion.so/0a66d01543eb49749e58eb9911c411f1?pvs=4)

---
### 좌표 기반 데이터로 통신 비용 절약

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/c3885644-2982-455b-b74f-0498af65acdd" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/8a26192e-b92a-4e88-9731-e335722f8e90" style="width: 70%;"/>
</div>

- 클라이언트에게 SVG 데이터 전송하는 것은 용량이 커져서 효율적이지 못했다.
- viewbox 데이터와 모서리 좌표 데이터를 전송하는 방식 도입했다.
- 데이터의 볼륨을 줄이고 네트워크 비용을 감소시켰다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/SVG-59444a6e16634fbb80cfc724215b92cf?pvs=4)

---
### 반정규화를 통한 DB 효율성 확보

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/14dc5243-45d5-43f5-ba12-3f1839a37181" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/0479f029-6c01-4be3-8de0-5a36d480474b" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/8a4374de-b667-424c-8a68-ab580ee824c5" style="width: 70%;"/>
</div>

- 좌석 배치 데이터 저장을 위해 좌석 하나당 하나의 행을 차지했다. 또한 좌석 조회시 JOIN을 통해 데이터를 조회해야 했다.
- 좌석 배치 데이터의 정적인 특성을 활용해, 저장 형태를 압축하는 반정규화를 했다.
- 좌석 배치 데이터의 관리, 조회에 드는 오버헤드를 해소하였다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/DB-3ff65e3d59094c08a3b3371e51a5cee5?pvs=4)

---
### Redis 동시성 이슈 예방, 조회/수정 쿼리 성능 개선

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/4cfe7fea-405f-4a18-9107-2977c79b1bec" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/e5b36e55-635a-4775-9066-d754896ecd49" style="width: 70%;"/>
</div>

- 좌석 현황의 저장 형태가 길어 수정/조회에 큰 오버헤드가 있었다. 또한 좌석 현황에 대한 동시적 수정/조회 때문에 동시성 이슈가 발생했다.
- 좌석 현황의 저장 타입을 변환하여 부분 수정을 가능케 하고, 조회/수정 명령에는 원자성을 부여했다.
- 가장 요청이 많고 핵심 병목 구간인 좌석 현황에서, 동시성을 제어하고 쿼리 성능을 개선해 병목을 완화했다.

[[자세히보기]](https://chestnut-sense-efd.notion.site/Lua-c0aa5206efa748b882c0830f5acc1c87?pvs=4)

---
### TanstackQuery의 queryKey, staleTime, invalidQueries를 이용한 API 호출 최소화

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/1c79c967-596e-49e4-a676-903d4ba66f26" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/d0142c11-dd70-4064-9d78-b959c1810bfe" style="width: 70%;"/>
</div>

- 여러 페이지에서 동일한 데이터에 대한 API 반복해서 호출하고 있었다.
- query키와 staleTIme설정을 통해서 캐시 데이터를 사용했다.
- API 호출 감소로 서버 부하를 감소시켰다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/react-query-cache-api-150313ed69ba80a9abe0ff364e7e1c54?pvs=4)

---
### UI/UX 설계를 통한 동시 선택 문제 해결

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/22f0e213-aac3-4e44-a292-25c3b1098320" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/3c005bea-c50b-416f-9ddb-3e947fae030a" style="width: 70%;"/>
</div>

- 여러 사용자의 좌석 동시 선택으로 인한 충돌 문제가 있었다.
- 클라이언트에서는 pending 상태를 표시, 서버에서 실패 응답시에는 사용자 행동을 방해하지 않으면서 실패 사실을 알렸다.
- 사용자는 동시 선택 충돌이 일어나더라도 다음 행동을 방해받지 않으며, 즉시 인지하여 다른 좌석을 취할 수 있다.

[[자세히 보기]](https://chestnut-sense-efd.notion.site/pending-151313ed69ba808ba991d9ed32e7a2b5?pvs=4)

---
### 쿼리문 감소를 위한 TypeORM 최적화

<div style="display: flex; gap: 0;">
  <img src="https://github.com/user-attachments/assets/c1e64524-2cd9-4c50-aa62-710936213188" style="width: 70%;"/>
  <img src="https://github.com/user-attachments/assets/cbb79390-993c-41b4-97a0-3417d12b5d01" style="width: 70%;"/>
</div>

- 개발 편의성을 위해 도입한 TypeORM이 불필요한 쿼리 요청을 만들어내고 있었다.
- 옵션을 통한 선택적 EAGER 로딩 정책으로 필요한 데이터만 불러오도록 한다.
- 최소한의 쿼리로 필요한 데이터만 불러오도록 해 효율적으로 TypeORM을 사용한다.
  
 [[자세히 보기]](https://chestnut-sense-efd.notion.site/TypeORM-e104a976e6be434dbecd33d48ad8f0d0?pvs=4)

---
## 팀 1호선: 팀원 소개

> 모두 1호선에 살고 있어요

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/KWAKMANBO"><img src="https://github.com/user-attachments/assets/c6555879-8355-4ba3-b8c0-1ef4ad2b5d22" width="100px;" alt=""/><br /><sub><b>J05_곽희상</b></sub></a><br />1호선 당정역</td>
      <td align="center"><a href="https://github.com/Donggle0315"><img src="https://github.com/user-attachments/assets/f273520b-a7a9-4bae-85aa-819785192065" width="100px;" alt=""/><br /><sub><b>J033_김동현</b></sub></a><br />1호선 동암역</td>
      <td align="center"><a href="https://github.com/qkdl60"><img src="https://github.com/user-attachments/assets/2aefb797-9942-482b-86e5-c776b649aca6" width="100px;" alt=""/><br /><sub><b>J102_박노철</b></sub></a><br />1호선 대방역</td>
      <td align="center"><a href="https://github.com/kyu4583"><img src="https://github.com/user-attachments/assets/f0d1aad8-fe7c-4233-b42c-30ee7b946283" width="100px;" alt=""/><br /><sub><b>J144_신성규</b></sub></a><br />1호선 주안역</td>
    </tr>
  </tbody>
</table>





