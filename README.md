# RealTicket

[📚팀 노션](https://chestnut-sense-efd.notion.site/RealTicket-12d313ed69ba805cb271cd1f51f8272b?pvs=4)   
[🎟️RealTicket 홈페이지](http://www.realticket.store/program)

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

### 우리팀의 강점

1. 꾸준한 회의록 아카이빙!! - [🧑‍🤝‍🧑회의록](https://www.notion.so/12d313ed69ba808e8b37e8249f515f5f?pvs=4)
2. 빠른 피드백과 소통
3. 오프라인 만남을 통한 전우애





# 프로젝트 개요

> 🎟️ “RealTicket”

https://github.com/user-attachments/assets/1262b03f-9149-4da0-84c0-55853dd5bf7e

"실시간으로 좌석을, 실수 없이 예매하다!”

구닥다리 인터파크 티켓은 이제 안녕.

현대에 걸맞는 UX를 추구하는 새로운 티켓팅 서비스

### 서비스 개요

<img src ="https://github.com/user-attachments/assets/bb849a55-bf8c-457d-9668-5d5105acbfe8" width="400" height="200">


 #### 😢 기존 서비스의 불편함
 기존 인터파크, YES24와 같은 플랫폼을 통해 예매시 좌석을 선택하고 예매를 진행하면 위처럼 이미 선택된 좌석이라는 문구가 나오는 경우가 많았습니다. 일반적으론 다시 이전화면으로 돌아가 예매를 진행해야되는데 이미 예매가 끝나있어 자리를 잡지 못하고 하염없이 취소표를 기다리거나 아니면 아예 포기해야하는 불편함이 있었습니다. 

 #### ☺️ 우리 서비스는?
RealTicket 이러한 불편함을 해소하기위해 정말 실시간으로 선점되는 좌석을 확인하면서 예매할 수있는 실시간 예매 서비스를 제공하고자합니다.



## 기능 흐름

### 컨텐츠 선택

![image](https://github.com/user-attachments/assets/479ba59f-b009-4fb4-adeb-45356010f945)

- 예매하고 싶은 컨텐츠를 선택합니다.

### 예매 입장 / 대기 큐

![image](https://github.com/user-attachments/assets/1288e4ba-baf4-48a4-a7ed-e1d50345773f)

- 예매가 오픈되어 있다면 '예매하기'로 이동할 수 있습니다.
- 예매가 아직 오픈되지 않았다면, '예매하기' 버튼이 비활성화 됩니다.
  - 이 때 서버 시간을 받아와 남은 시간을 카운트다운 해줍니다.
- '예매하기'로 진입했으나 사람이 너무 많이 몰렸다면, 대기 큐 페이지로 이동해 순번을 기다리게 됩니다.

### 매크로 방지 확인 / 좌석 개수 선택

![image](https://github.com/user-attachments/assets/944e9131-e263-474b-bb97-32fc011379fd)

- 진입에 성공하면 매크로 방지 문자를 입력하게 됩니다.
- 그 뒤 예매할 좌석 개수를 선택해야 합니다.
  - 이는 우리 서비스의 특징을 악용하지 않도록 하는 중요한 과정입니다.

### 좌석 선택

![image](https://github.com/user-attachments/assets/9a3ebe8e-1f31-477a-87a4-7ed235a90420)

- 구역을 선택합니다.
- 좌석을 선택합니다.
  - **실시간으로 다른 사용자에 의해 선점되는 좌석을 확인할 수 있습니다.**
  - 좌석은 **선택과 동시에 선점**되어, 다른 사용자에게 뺏기지 않습니다.
  - 다시 클릭하여 선점을 해제할 수 있습니다.
  - 예매하기로 한 갯수만큼 선택해야 예매 확정이 가능합니다.

### 예매 확정

![image](https://github.com/user-attachments/assets/6e8fd7dc-cb4d-41aa-bf2a-6ebc4afde1ec)

- 예매가 확정되었습니다!
- 내비게이션 바의 사용자 패널에서 예매 정보를 확인/취소할 수 있습니다.

----

# 아키텍쳐

## 기술 스택

|도메인|기술 스택|
|:-:|:-:|
|공통| ![NPM](https://img.shields.io/badge/-npm-CB3837?logo=npm&logoColor=white) ![typescript](https://shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=white) ![ESLint](https://img.shields.io/badge/-ESLint-4B32C3?logo=eslint&logoColor=white) ![Prettier](https://img.shields.io/badge/-Prettier-F7B93E?logo=prettier&logoColor=white) ![Postman](https://img.shields.io/badge/-Postman-FF6C37?logo=postman&logoColor=white) |
|프론트 엔드| ![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white) ![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/-Tailwind%20CSS-38B2AC?logo=tailwind-css&logoColor=white) ![Axios](https://img.shields.io/badge/-Axios-5A29E4?logo=axios&logoColor=white) ![TanStack Query](https://img.shields.io/badge/-TanStack%20Query-FF4154?logo=react-query&logoColor=white) ![ReactRouter](https://img.shields.io/badge/-React%20Router-CA4245?logo=react-router&logoColor=white) |
|백엔드| ![NestJS](https://img.shields.io/badge/-NestJS-E0234E?logo=nestjs&logoColor=white) ![SSE](https://img.shields.io/badge/-SSE-000000?logo=SSE&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-4479A1?&logo=MySQL&logoColor=white) ![Redis](https://img.shields.io/badge/redis-E34F26?&logo=Redis&logoColor=white) ![Class Validator](https://img.shields.io/badge/-Class%20Validator-000000?logo=class-validator&logoColor=white)  ![Class transformer](https://img.shields.io/badge/-Class%20Transformer-000000?logo=class-transformer&logoColor=white) ![Scheduler](https://img.shields.io/badge/-Scheduler-000000?logo=scheduler&logoColor=white) ![Winston](https://img.shields.io/badge/-Winston-000000?logo=winston&logoColor=white)  ![Swagger](https://img.shields.io/badge/-Swagger-85EA2D?logo=swagger&logoColor=white) |
|배포|![nginx](https://img.shields.io/badge/-nginx-009639?logo=nginx&logoColor=white)  ![Ncloud](https://img.shields.io/badge/-Ncloud-03C75A?logo=Ncloud&logoColor=white) ![Docker Hub](https://img.shields.io/badge/-docker%20hub-2496ED?logo=docker-hub&logoColor=white)  ![Git Actions](https://img.shields.io/badge/-githubactions-2088FF?logo=githubactions&logoColor=white) |
|협업 도구|![Notion](https://img.shields.io/badge/-Notion-000000?logo=notion&logoColor=white) ![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white) ![Slack](https://img.shields.io/badge/-Slack-4A154B?logo=slack&logoColor=white) ![Figma](https://img.shields.io/badge/-Figma-F24E1E?logo=figma&logoColor=white)  |

## 아키텍처 설계도
<img width="992" alt="스크린샷 2024-12-02 19 43 19" src="https://github.com/user-attachments/assets/c4c693e1-56e2-4d06-a3a9-34c0b39431c8">

----
# 주요 기능 소개
## TypeORM
- [typeorm을 통한 사용한 이유와 entity 생성](https://chestnut-sense-efd.notion.site/TypeOrm-3afe7a39c14a43f09ef9d07b66ca3659?pvs=4)
- [typeorm 최적화 하기](https://chestnut-sense-efd.notion.site/TypeORM-e104a976e6be434dbecd33d48ad8f0d0?pvs=4)

## SSE를 통한 브로드캐스팅
- [SSE 선정 이유(웹소켓, 폴링과 비교)](https://www.notion.so/WebSocket-VS-SSE-d8fed9e7c2bc46318b565dc775b6535a?pvs=4)
- [SSE 브로드캐스트](https://www.notion.so/SSE-60d6e13d559a4376a7959534b26f7516?pvs=4)

## 좌석 현황 및 선점 관리
- [좌석 현황 및 선점 관리](https://www.notion.so/6fc9fec627034269b473d43116b84f57?pvs=4)
- [DB 스키마 설계](https://chestnut-sense-efd.notion.site/DB-3ff65e3d59094c08a3b3371e51a5cee5?pvs=4)
- [Lua 스크립트 적용](https://chestnut-sense-efd.notion.site/Lua-c0aa5206efa748b882c0830f5acc1c87?pvs=4)

## 대기 큐 상태 관리
- [대기 큐 정책 설계](https://chestnut-sense-efd.notion.site/8800343f85c644eca5dd1e373e4ef4b2?pvs=4)

## 반복적인 API 요청
- [React Query Cache 기능을 이용한 데이터 공유](https://www.notion.so/24-12-02-5ee838539793492d8e5d613c11ffe67a?pvs=4#150313ed69ba804db09ed9dab85c4f1e)

