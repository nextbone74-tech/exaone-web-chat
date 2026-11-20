
/* =========================================
   K-EXAONE 2.5 Web Chat
   app.js

   GitHub Pages -> Supabase Edge Function
   -> EXAONE API
========================================= */


/* =========================================
   1. Supabase 연결 설정
========================================= */

// 아래 두 값을 본인의 Supabase 정보로 변경하세요.

// 예시: https://abcdefghijklmnop.supabase.co
const SUPABASE_URL = "https://ptkvnqokpbzuhefkrggm.supabase.co/functions/v1/smooth-endpoint";

// Settings -> API Keys -> Publishable key
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BM8r92E4XJhObvGP-w--jg_XOOxAyfg";

// 배포한 Edge Function 이름
const FUNCTION_NAME = "exaone-chat";

// EXAONE 기본 모델 설정
const MODEL_NAME = "k-exaone_v2.5";

// 기본 시스템 프롬프트

const SYSTEM_PROMPT = `
당신은 정확하고 간결하게 답변하는 한국어 AI assistant입니다.

답변 원칙:
1. 질문에 대한 결론부터 제시합니다.
2. 핵심 내용만 간결하게 설명합니다.
3. 일반적인 질문은 3~5문장 이내로 답변합니다.
4. 불필요한 서론, 반복, 장황한 설명은 생략합니다.
5. 목록과 표는 필요한 경우에만 사용합니다.
6. 사용자가 상세한 설명을 요청한 경우에만 자세히 답변합니다.
7. 근거가 부족하면 추측하지 말고 불확실하다고 밝힙니다.
`;

// 응답 대기 제한 시간
const REQUEST_TIMEOUT = 145000;


/* =========================================
   2. DOM 요소
========================================= */

const chatArea = document.getElementById("chatArea");
const messageList = document.getElementById("messageList");
const welcomeScreen = document.getElementById("welcomeScreen");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

const statusText = document.getElementById("statusText");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

const reasoningEffort = document.getElementById("reasoningEffort");
const maxTokens = document.getElementById("maxTokens");
const maxTokensValue = document.getElementById("maxTokensValue");

const temperature = document.getElementById("temperature");
const temperatureValue = document.getElementById("temperatureValue");


/* =========================================
   3. 대화 상태
========================================= */

// API에 전달할 대화 기록
let conversationHistory = [];

// 현재 응답 생성 중인지 확인
let isGenerating = false;

// 현재 실행 중인 요청
let currentController = null;

// 사용자 설정
let settings = {
  reasoning_effort: "low",
  max_tokens: 2048,
  temperature: 1.0,
  top_p: 0.95
};


/* =========================================
   4. 초기화
========================================= */

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {

  // 전송 버튼
  sendBtn.addEventListener("click", sendMessage);

  // 새 대화
  newChatBtn.addEventListener("click", createNewChat);

  // 설정 창
  settingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", closeSettings);
  saveSettingsBtn.addEventListener("click", saveSettings);

  // 설정값 표시
  maxTokens.addEventListener("input", () => {
    maxTokensValue.textContent = maxTokens.value;
  });

  temperature.addEventListener("input", () => {
    temperatureValue.textContent =
      Number(temperature.value).toFixed(1);
  });

  // Enter 전송 / Shift+Enter 줄바꿈
  messageInput.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();

      sendMessage();
    }
  });

  // 입력창 높이 자동 조절
  messageInput.addEventListener("input", resizeInput);

  // 모달 바깥 클릭 시 닫기
  settingsModal.addEventListener("click", event => {

    if (event.target === settingsModal) {
      closeSettings();
    }
  });

  updateStatus("준비 완료");
}


/* =========================================
   5. 입력창 높이 자동 조절
========================================= */

function resizeInput() {

  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 180) + "px";
}


/* =========================================
   6. 새 대화
========================================= */

function createNewChat() {

  if (isGenerating) {
    return;
  }

  conversationHistory = [];

  messageList.innerHTML = "";

  welcomeScreen.classList.remove("hidden");

  messageInput.value = "";

  resizeInput();

  updateStatus("새 대화 준비 완료");

  messageInput.focus();
}


/* =========================================
   7. 상태 표시
========================================= */

function updateStatus(message) {

  statusText.textContent = message;
}


/* =========================================
   8. 화면 자동 스크롤
========================================= */

function scrollToBottom() {

  chatArea.scrollTop = chatArea.scrollHeight;
}


/* =========================================
   9. 메시지 말풍선 생성
========================================= */

function createMessageElement(role, content = "") {

  const row = document.createElement("div");

  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");

  avatar.className = "message-avatar";

  avatar.textContent =
    role === "user" ? "ME" : "AI";

  const messageContent = document.createElement("div");

  messageContent.className = "message-content";

  const name = document.createElement("div");

  name.className = "message-name";

  name.textContent =
    role === "user" ? "사용자" : "K-EXAONE 2.5";

  const bubble = document.createElement("div");

  bubble.className = "message-bubble";

  // HTML을 실행하지 않고 일반 텍스트로 출력
  bubble.textContent = content;

  messageContent.appendChild(name);
  messageContent.appendChild(bubble);

  if (role === "assistant") {
    row.appendChild(avatar);
    row.appendChild(messageContent);
  } else {
    row.appendChild(messageContent);
    row.appendChild(avatar);
  }

  messageList.appendChild(row);

  welcomeScreen.classList.add("hidden");

  scrollToBottom();

  return {
    row,
    bubble
  };
}


/* =========================================
   10. 로딩 표시
========================================= */


function createLoadingElement() {

  const row = document.createElement("div");
  row.className = "message-row assistant";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "AI";

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = "K-EXAONE 2.5";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  // 실제 점 3개를 표시
  const dots = document.createElement("span");
  dots.className = "loading-dots";
  dots.textContent = "...";

  bubble.appendChild(dots);

  content.appendChild(name);
  content.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(content);

  messageList.appendChild(row);

  scrollToBottom();

  return row;
}


/* =========================================
   11. 전송 상태 변경
========================================= */

function setGenerating(value) {

  isGenerating = value;

  sendBtn.disabled = value;
  newChatBtn.disabled = value;
  settingsBtn.disabled = value;

  messageInput.disabled = value;

  sendBtn.textContent = value ? "..." : "➤";

  if (value) {
    updateStatus("EXAONE 답변 생성 중...");
  } else {
    updateStatus("준비 완료");
    messageInput.focus();
  }
}


/* =========================================
   12. 메시지 전송
========================================= */

async function sendMessage() {

  if (isGenerating) {
    return;
  }

  const question = messageInput.value.trim();

  if (!question) {
    return;
  }

  // Supabase 연결 정보 확인
  if (
    SUPABASE_URL.includes("YOUR_") ||
    SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")
  ) {

    alert(
      "Supabase 연결 정보가 입력되지 않았습니다.\n" +
      "app.js의 연결 설정을 확인하세요."
    );

    return;
  }

  // 사용자 질문 출력
  createMessageElement("user", question);

  // 입력창 초기화
  messageInput.value = "";

  resizeInput();

  // 사용자 메시지 기록
  conversationHistory.push({
    role: "user",
    content: question
  });

  setGenerating(true);

  const loadingElement = createLoadingElement();

  let assistantBubble = null;

  let receivedContent = false;

  let assistantText = "";

  currentController = new AbortController();

  const timeoutId = setTimeout(() => {

    if (currentController) {
      currentController.abort();
    }

  }, REQUEST_TIMEOUT);

  try {

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY
        },

        body: JSON.stringify({

          model: MODEL_NAME,

          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            ...conversationHistory
          ],

          reasoning_effort: settings.reasoning_effort,

          max_tokens: settings.max_tokens,

          temperature: settings.temperature,

          top_p: settings.top_p,

          stream: true

        }),

        signal: currentController.signal
      }
    );

    // HTTP 오류 확인
    if (!response.ok) {

      let errorText = "";

      try {
        errorText = await response.text();
      } catch (error) {
        errorText = "오류 내용을 읽을 수 없습니다.";
      }

      throw new Error(
        `HTTP ${response.status}\n${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("서버에서 스트리밍 응답을 받지 못했습니다.");
    }

   // 실제 답변이 도착하면 로딩 말풍선을 답변 말풍선로 변경
   function showAssistantBubble() {
   
     if (assistantBubble) {
       return;
     }
   
     // 로딩 표시 제거
     //loadingElement.remove();
   
     // 실제 답변 말풍선 생성
     //const messageElement =
     //  createMessageElement("assistant", "");
   
     //assistantBubble = messageElement.bubble;
   }

    // 스트리밍 읽기
    const reader = response.body.getReader();

    const decoder = new TextDecoder("utf-8");

    let buffer = "";

    let streamFinished = false;

    while (!streamFinished) {

      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {

        const trimmedLine = line.trim();

        if (!trimmedLine.startsWith("data:")) {
          continue;
        }

        const data = trimmedLine.slice(5).trim();

        if (!data) {
          continue;
        }

        if (data === "[DONE]") {

          streamFinished = true;

          break;
        }

        let parsed;

        try {

          parsed = JSON.parse(data);

        } catch (error) {

          console.warn("SSE 데이터 해석 실패:", data);

          continue;
        }

        // API 오류 확인
        if (parsed.error) {

          throw new Error(
            parsed.error.message ||
            "EXAONE API 응답 오류"
          );
        }

        const delta =
          parsed.choices?.[0]?.delta;

        if (!delta) {
          continue;
        }

        /*
          중요:
          reasoning_content는 화면에 출력하지 않음.
          실제 답변인 content만 출력.
        */

        const content = delta.content;

         if (typeof content === "string" && content.length > 0) {
         
           // 첫 답변이 도착한 시점에만 로딩 표시 제거
           showAssistantBubble();
         
           assistantText += content;
         
           assistantBubble.textContent = assistantText;
         
           receivedContent = true;
         
           scrollToBottom();
         }
      }
    }

    // 마지막 버퍼 처리
    if (buffer.trim().startsWith("data:")) {

      const lastData = buffer.trim().slice(5).trim();

      if (lastData && lastData !== "[DONE]") {

        try {

          const parsed = JSON.parse(lastData);

          const content =
            parsed.choices?.[0]?.delta?.content;

            if (typeof content === "string" && content.length > 0) {
            
              showAssistantBubble();
            
              assistantText += content;
            
              assistantBubble.textContent = assistantText;
            
              receivedContent = true;
            }

        } catch (error) {

          console.warn("마지막 SSE 데이터 해석 실패:", error);
        }
      }
    }

    // 응답 내용 확인
    if (!receivedContent) {

      throw new Error(
        "응답은 수신했지만 표시할 답변 내용이 없습니다."
      );
    }

    // 대화 기록 저장
    conversationHistory.push({
      role: "assistant",
      content: assistantText
    });

    updateStatus("답변 완료");

  } catch (error) {

    console.error("챗봇 오류:", error);

    loadingElement.remove();

    // 실패한 사용자 질문 제거
    conversationHistory.pop();

    const errorMessage = document.createElement("div");

    errorMessage.className = "error-message";

    if (error.name === "AbortError") {

      errorMessage.textContent =
        "응답 시간이 초과되었거나 요청이 취소되었습니다. 다시 질문해 주세요.";

    } else {

      errorMessage.textContent =
        "오류가 발생했습니다: " + error.message;
    }

    if (assistantBubble) {

      assistantBubble.textContent = "";

      assistantBubble.appendChild(errorMessage);

    } else {

      const errorElement =
        createMessageElement("assistant", "");

      errorElement.bubble.appendChild(errorMessage);
    }

    updateStatus("오류 발생");

  } finally {

    clearTimeout(timeoutId);

    currentController = null;

    setGenerating(false);
  }
}


/* =========================================
   13. 설정 창 열기
========================================= */

function openSettings() {

  if (isGenerating) {
    return;
  }

  reasoningEffort.value = settings.reasoning_effort;

  maxTokens.value = settings.max_tokens;

  maxTokensValue.textContent = settings.max_tokens;

  temperature.value = settings.temperature;

  temperatureValue.textContent =
    Number(settings.temperature).toFixed(1);

  settingsModal.classList.remove("hidden");
}


/* =========================================
   14. 설정 창 닫기
========================================= */

function closeSettings() {

  settingsModal.classList.add("hidden");
}


/* =========================================
   15. 설정 저장
========================================= */

function saveSettings() {

  settings.reasoning_effort =
    reasoningEffort.value;

  settings.max_tokens =
    Number(maxTokens.value);

  settings.temperature =
    Number(temperature.value);

  settings.top_p = 0.95;

  closeSettings();

  updateStatus("AI 응답 설정 저장 완료");
}
