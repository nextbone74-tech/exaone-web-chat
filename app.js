
/* =====================================================
   K-EXAONE 2.5 WEB CHAT
   app.js

   GitHub Pages
       ↓
   Supabase Edge Function
       ↓
   EXAONE API

   주요 기능
   1. 실시간 스트리밍
   2. 오류 코드 및 상세 메시지 표시
   3. 답변 생성 중 물결 애니메이션
   4. null 오류 방지
   5. 새 대화
   6. AI 응답 설정
   7. 대화 기록 관리
===================================================== */


/* =====================================================
   1. SUPABASE 연결 설정
===================================================== */

// 본인의 Supabase 프로젝트 URL
const SUPABASE_URL =
  "https://ptkvnqokpbzuhefkrggm.supabase.co/functions/v1/smooth-endpoint";

// Supabase Publishable Key
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BM8r92E4XJhObvGP-w--jg_XOOxAyfg";

// Edge Function 이름
const FUNCTION_NAME = "exaone-chat";

// 모델 이름
const MODEL_NAME = "k-exaone_v2.5";

// 기본 시스템 프롬프트
const SYSTEM_PROMPT = `
당신은 정확하고 간결하게 답변하는 한국어 AI assistant입니다.

답변 원칙:
1. 질문에 대한 결론부터 제시합니다.
2. 핵심 내용 위주로 설명합니다.
3. 일반적인 질문은 3~5문장 이내로 답변합니다.
4. 불필요한 서론, 반복, 장황한 설명은 생략합니다.
5. 목록과 표는 필요한 경우에만 사용합니다.
6. 상세한 설명을 요청하면 충분히 설명합니다.
7. 근거가 부족하면 추측하지 말고 불확실하다고 밝힙니다.
`;

// 브라우저 요청 제한 시간
const REQUEST_TIMEOUT = 145000;

// 대화 기록 최대 유지 횟수
// 사용자 질문과 AI 답변 3쌍
const MAX_HISTORY_MESSAGES = 6;


/* =====================================================
   2. HTML 요소 연결
===================================================== */

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


/* =====================================================
   3. 전역 상태
===================================================== */

let conversationHistory = [];

let isGenerating = false;

let currentController = null;

let settings = {
  reasoning_effort: "low",
  max_tokens: 2048,
  temperature: 1.0,
  top_p: 0.95
};


/* =====================================================
   4. 초기화
===================================================== */

function initialize() {

  if (!chatArea || !messageList || !messageInput || !sendBtn) {
    console.error("필수 HTML 요소를 찾을 수 없습니다.");
    return;
  }

  sendBtn.addEventListener("click", sendMessage);

  newChatBtn.addEventListener("click", createNewChat);

  settingsBtn.addEventListener("click", openSettings);

  closeSettingsBtn.addEventListener("click", closeSettings);

  saveSettingsBtn.addEventListener("click", saveSettings);

  maxTokens.addEventListener("input", () => {
    maxTokensValue.textContent = maxTokens.value;
  });

  temperature.addEventListener("input", () => {
    temperatureValue.textContent =
      Number(temperature.value).toFixed(1);
  });

  messageInput.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();

      sendMessage();
    }
  });

  messageInput.addEventListener("input", resizeInput);

  settingsModal.addEventListener("click", event => {

    if (event.target === settingsModal) {
      closeSettings();
    }
  });

  updateStatus("준비 완료");
}


// DOM 로딩 상태에 따라 초기화
if (document.readyState === "loading") {

  document.addEventListener("DOMContentLoaded", initialize);

} else {

  initialize();
}


/* =====================================================
   5. 입력창 높이 자동 조절
===================================================== */

function resizeInput() {

  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 180) + "px";
}


/* =====================================================
   6. 상태 표시
===================================================== */

function updateStatus(message) {

  if (statusText) {
    statusText.textContent = message;
  }
}


/* =====================================================
   7. 화면 자동 스크롤
===================================================== */

function scrollToBottom() {

  if (chatArea) {
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}


/* =====================================================
   8. 메시지 말풍선 생성
===================================================== */

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

  // HTML 실행 방지를 위해 일반 텍스트로 출력
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

  if (welcomeScreen) {
    welcomeScreen.classList.add("hidden");
  }

  scrollToBottom();

  return {
    row,
    bubble
  };
}


/* =====================================================
   9. 로딩 말풍선 생성
===================================================== */

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

  bubble.className = "message-bubble loading-bubble";

  // 점 3개 생성
  const dots = document.createElement("span");

  dots.className = "loading-dots";

  for (let i = 0; i < 3; i++) {

    const dot = document.createElement("span");

    dot.className = "loading-dot";

    dots.appendChild(dot);
  }

  bubble.appendChild(dots);

  content.appendChild(name);

  content.appendChild(bubble);

  row.appendChild(avatar);

  row.appendChild(content);

  messageList.appendChild(row);

  scrollToBottom();

  return row;
}


/* =====================================================
   10. 실제 답변 말풍선 생성
===================================================== */

function showAssistantBubble(loadingElement) {

  // 이미 답변 말풍선이 있으면 재사용
  if (loadingElement && loadingElement.dataset.answerShown === "true") {

    return loadingElement.querySelector(".message-bubble");
  }

  // 로딩 말풍선 제거
  if (loadingElement && loadingElement.parentNode) {

    loadingElement.remove();
  }

  // 실제 답변 말풍선 생성
  const messageElement =
    createMessageElement("assistant", "");

  if (loadingElement) {

    loadingElement.dataset.answerShown = "true";

    // 실제 말풍선 참조 저장
    loadingElement.answerBubble = messageElement.bubble;
  }

  return messageElement.bubble;
}


/* =====================================================
   11. 로딩 상태 변경
===================================================== */

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


/* =====================================================
   12. 오류 정보 추출
===================================================== */

function extractErrorInfo(data, httpStatus = null) {

  let code = "";

  let message = "";

  let details = "";

  if (typeof data === "string") {

    try {

      data = JSON.parse(data);

    } catch {

      message = data;
    }
  }

  if (data && typeof data === "object") {

    const error = data.error || data;

    if (typeof error === "string") {

      message = error;

    } else {

      code =
        error.code ||
        error.error_code ||
        data.code ||
        "";

      message =
        error.message ||
        error.msg ||
        data.message ||
        "";

      details =
        error.details ||
        error.detail ||
        data.details ||
        "";
    }
  }

  if (!code && httpStatus) {

    code = `HTTP_${httpStatus}`;
  }

  if (!code) {

    code = "EXAONE_API_ERROR";
  }

  if (!message) {

    message = "API 요청을 처리하지 못했습니다.";
  }

  return {
    code: String(code),
    message: String(message),
    details: typeof details === "string"
      ? details
      : JSON.stringify(details)
  };
}


/* =====================================================
   13. 오류 메시지 화면 출력
===================================================== */

function displayError(errorInfo, assistantBubble, loadingElement) {

  const code = errorInfo.code || "UNKNOWN_ERROR";

  const message =
    errorInfo.message || "알 수 없는 오류가 발생했습니다.";

  const details = errorInfo.details || "";

  const errorText = [
    "오류가 발생했습니다.",
    "",
    `Error Code: ${code}`,
    `Message: ${message}`,
    details ? `Details: ${details}` : ""
  ].filter(Boolean).join("\n");

  let targetBubble = assistantBubble;

  // 기존 답변 말풍선이 없으면 로딩 말풍선 제거 후 오류 말풍선 생성
  if (!targetBubble) {

    if (loadingElement && loadingElement.parentNode) {

      loadingElement.remove();
    }

    const errorElement =
      createMessageElement("assistant", "");

    targetBubble = errorElement.bubble;
  }

  // null 방지
  if (targetBubble) {

    targetBubble.textContent = errorText;

    targetBubble.classList.add("error-bubble");
  }

  updateStatus(`오류 발생: ${code}`);

  scrollToBottom();
}


/* =====================================================
   14. SSE 데이터 처리
===================================================== */

function processSSEData(data, state) {

  if (!data || data === "[DONE]") {

    return data === "[DONE]";
  }

  let parsed;

  try {

    parsed = JSON.parse(data);

  } catch (error) {

    console.warn("SSE JSON 해석 실패:", data);

    return false;
  }

  // 서버에서 전달한 오류 처리
  if (parsed.error) {

    const errorInfo = extractErrorInfo(parsed);

    const error = new Error(errorInfo.message);

    error.code = errorInfo.code;

    error.details = errorInfo.details;

    throw error;
  }

  // OpenAI 호환 스트리밍 응답
  const choice = parsed.choices?.[0];

  if (choice) {

    const delta = choice.delta || {};

    // 추론 내용은 화면에 표시하지 않음
    // reasoning_content는 무시

    if (
      typeof delta.content === "string" &&
      delta.content.length > 0
    ) {

      state.onContent(delta.content);
    }

    if (choice.finish_reason) {

      state.finishReason = choice.finish_reason;
    }
  }

  // 사용량 정보 기록
  if (parsed.usage) {

    state.usage = parsed.usage;
  }

  return false;
}


/* =====================================================
   15. HTTP 오류 응답 처리
===================================================== */

async function readHttpError(response) {

  let rawText = "";

  try {

    rawText = await response.text();

  } catch {

    rawText = "서버 오류 내용을 읽을 수 없습니다.";
  }

  let errorInfo = extractErrorInfo(
    rawText,
    response.status
  );

  if (!errorInfo.code) {

    errorInfo.code = `HTTP_${response.status}`;
  }

  if (!errorInfo.message) {

    errorInfo.message = response.statusText;
  }

  return errorInfo;
}


/* =====================================================
   16. 새 대화
===================================================== */

function createNewChat() {

  if (isGenerating) {
    return;
  }

  conversationHistory = [];

  messageList.innerHTML = "";

  if (welcomeScreen) {

    welcomeScreen.classList.remove("hidden");
  }

  messageInput.value = "";

  resizeInput();

  updateStatus("새 대화 준비 완료");

  messageInput.focus();
}


/* =====================================================
   17. 메시지 전송
===================================================== */

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

  // 사용자 질문 표시
  createMessageElement("user", question);

  messageInput.value = "";

  resizeInput();

  // 사용자 질문 기록
  conversationHistory.push({
    role: "user",
    content: question
  });

  setGenerating(true);

  // 로딩 말풍선 생성
  const loadingElement = createLoadingElement();

  // 실제 답변 말풍선
  let assistantBubble = null;

  // 답변 텍스트
  let assistantText = "";

  // 응답 수신 여부
  let receivedContent = false;

  // 응답 종료 정보
  const streamState = {
    finishReason: null,
    usage: null,

    onContent: (content) => {

      // 첫 답변이 도착했을 때 로딩 표시 제거
      if (!assistantBubble) {

        assistantBubble =
          showAssistantBubble(loadingElement);
      }

      // 실제 답변 추가
      assistantText += content;

      // 말풍선이 존재하는지 확인
      if (assistantBubble) {

        assistantBubble.textContent = assistantText;
      }

      receivedContent = true;

      scrollToBottom();
    }
  };

  // 요청별 AbortController
  const controller = new AbortController();

  currentController = controller;

  let timedOut = false;

  const timeoutId = setTimeout(() => {

    timedOut = true;

    controller.abort();

  }, REQUEST_TIMEOUT);

  let reader = null;

  try {

    /* ---------------------------------------------
       Supabase 호출
    --------------------------------------------- */

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
            ...conversationHistory.slice(-MAX_HISTORY_MESSAGES)
          ],

          reasoning_effort: settings.reasoning_effort,

          max_tokens: settings.max_tokens,

          temperature: settings.temperature,

          top_p: settings.top_p,

          stream: true
        }),

        signal: controller.signal
      }
    );


    /* ---------------------------------------------
       HTTP 상태 확인
    --------------------------------------------- */

    if (!response.ok) {

      const errorInfo = await readHttpError(response);

      const error = new Error(errorInfo.message);

      error.code = errorInfo.code;

      error.details = errorInfo.details;

      error.httpStatus = response.status;

      throw error;
    }


    /* ---------------------------------------------
       응답 형식 확인
    --------------------------------------------- */

    const contentType =
      response.headers.get("content-type") || "";

    if (!response.body) {

      const error = new Error(
        "서버에서 응답 스트림을 받지 못했습니다."
      );

      error.code = "EMPTY_RESPONSE_BODY";

      throw error;
    }

    // JSON 오류가 HTTP 200으로 전달된 경우
    if (contentType.includes("application/json")) {

      const result = await response.json();

      const errorInfo = extractErrorInfo(result);

      const error = new Error(errorInfo.message);

      error.code = errorInfo.code;

      error.details = errorInfo.details;

      throw error;
    }


    /* ---------------------------------------------
       SSE 스트리밍 시작
    --------------------------------------------- */

    reader = response.body.getReader();

    const decoder = new TextDecoder("utf-8");

    let buffer = "";

    let streamFinished = false;


    /* ---------------------------------------------
       SSE 한 줄 처리
    --------------------------------------------- */

    function processLine(line) {

      const trimmedLine = line.trim();

      if (!trimmedLine.startsWith("data:")) {

        return false;
      }

      const data = trimmedLine.slice(5).trim();

      if (!data) {

        return false;
      }

      return processSSEData(data, streamState);
    }


    /* ---------------------------------------------
       실시간 응답 읽기
    --------------------------------------------- */

    while (!streamFinished) {

      const { value, done } = await reader.read();

      if (done) {

        break;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");

      // 마지막 불완전한 줄은 다음 데이터까지 보관
      buffer = lines.pop() || "";

      for (const line of lines) {

        const finished = processLine(line);

        if (finished) {

          streamFinished = true;

          break;
        }
      }
    }


    /* ---------------------------------------------
       마지막 버퍼 처리
    --------------------------------------------- */

    buffer += decoder.decode();

    if (buffer.trim()) {

      const lastLines = buffer.split("\n");

      for (const line of lastLines) {

        processLine(line);
      }
    }


    /* ---------------------------------------------
       답변 생성 여부 확인
    --------------------------------------------- */

    if (!receivedContent) {

      let errorCode = "EXAONE_EMPTY_RESPONSE";

      let errorMessage =
        "최종 답변 내용이 생성되지 않았습니다.";

      if (streamState.finishReason === "length") {

        errorCode = "MAX_TOKENS_EXCEEDED";

        errorMessage =
          "토큰 한도에 도달하여 최종 답변이 생성되지 않았습니다. 최대 출력 토큰을 높여 다시 시도해 주세요.";

      } else if (streamState.finishReason === "content_filter") {

        errorCode = "CONTENT_FILTERED";

        errorMessage =
          "응답이 콘텐츠 필터에 의해 제한되었습니다.";

      }

      const error = new Error(errorMessage);

      error.code = errorCode;

      error.details =
        streamState.finishReason
          ? `finish_reason: ${streamState.finishReason}`
          : "finish_reason 정보가 수신되지 않았습니다.";

      throw error;
    }


    /* ---------------------------------------------
       대화 기록 저장
    --------------------------------------------- */

    conversationHistory.push({

      role: "assistant",

      content: assistantText

    });

    updateStatus("답변 완료");


  } catch (error) {

    console.error("EXAONE Chat Error:", error);


    /* ---------------------------------------------
       실패한 사용자 질문 기록 제거
    --------------------------------------------- */

    const lastMessage =
      conversationHistory[conversationHistory.length - 1];

    if (lastMessage && lastMessage.role === "user") {

      conversationHistory.pop();
    }


    /* ---------------------------------------------
       오류 코드 분류
    --------------------------------------------- */

    let errorInfo;

    if (timedOut || error.name === "AbortError") {

      errorInfo = {

        code: timedOut
          ? "REQUEST_TIMEOUT"
          : "REQUEST_ABORTED",

        message: timedOut
          ? "응답 시간이 초과되었습니다. 잠시 후 다시 질문해 주세요."
          : "요청이 취소되었습니다.",

        details: `요청 제한 시간: ${REQUEST_TIMEOUT / 1000}초`
      };

    } else if (error.code) {

      errorInfo = {

        code: error.code,

        message: error.message,

        details: error.details || ""
      };

    } else if (error instanceof TypeError) {

      errorInfo = {

        code: "NETWORK_OR_CORS_ERROR",

        message:
          "Supabase 서버에 연결하지 못했습니다.",

        details:
          "Supabase URL, Publishable Key, CORS 설정 및 네트워크 상태를 확인하세요."
      };

    } else {

      errorInfo = {

        code: "CLIENT_ERROR",

        message: error.message || "알 수 없는 오류가 발생했습니다.",

        details: ""
      };
    }


    /* ---------------------------------------------
       오류 말풍선 표시
       assistantBubble이 null이어도 정상 처리
    --------------------------------------------- */

    displayError(
      errorInfo,
      assistantBubble,
      loadingElement
    );

  } finally {

    clearTimeout(timeoutId);

    // 응답 스트림 정리
    if (reader) {

      try {

        await reader.cancel();

      } catch (error) {

        // 이미 종료된 스트림은 무시
      }
    }

    currentController = null;

    setGenerating(false);
  }
}


/* =====================================================
   18. 설정 창 열기
===================================================== */

function openSettings() {

  if (isGenerating) {
    return;
  }

  reasoningEffort.value =
    settings.reasoning_effort;

  maxTokens.value =
    settings.max_tokens;

  maxTokensValue.textContent =
    settings.max_tokens;

  temperature.value =
    settings.temperature;

  temperatureValue.textContent =
    Number(settings.temperature).toFixed(1);

  settingsModal.classList.remove("hidden");
}


/* =====================================================
   19. 설정 창 닫기
===================================================== */

function closeSettings() {

  settingsModal.classList.add("hidden");
}


/* =====================================================
   20. 설정 저장
===================================================== */

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
