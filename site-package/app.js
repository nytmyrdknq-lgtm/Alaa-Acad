/* Alaa Academy / Bimo — static starter. No private server required. */
(() => {
  const $ = (id) => document.getElementById(id);
  const SUBJECTS = [
    "اللغة الإنجليزية", "اللغة الإنجليزية - التمارين",
    "الأحياء", "الكيمياء", "الفيزياء", "الرياضيات"
  ];
  const state = {
    apiKey: "",
    model: "openai/gpt-4o-mini",
    messages: [],
    books: [],
    busy: false,
    freeMessages: 0,
    subscriptionExpiresAt: 0,
    subscriptionStorageAvailable: true
  };
  const FREE_MESSAGE_LIMIT = 5;
  const SUBSCRIPTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
  const SUBSCRIPTION_STORAGE_KEY = "bimo_subscription_state";
  const API_KEY_STORAGE_KEY = "bimo_openrouter_key";

  const subjectSelect = $("subject-select");
  SUBJECTS.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectSelect.appendChild(option);
  });

  function setStatus(ready, label) {
    $("connection-label").textContent = label;
    const dot = document.querySelector(".top-tag .status-dot");
    dot.classList.toggle("ready", ready);
  }
  function showSubscription(message = "") {
    $("subscription-overlay").classList.remove("hidden");
    $("subscription-message").textContent = message;
    $("subscription-code").focus();
  }
  function persistSubscription() {
    try {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify({
        freeMessages: state.freeMessages,
        expiresAt: state.subscriptionExpiresAt
      }));
      return true;
    } catch (error) {
      state.subscriptionStorageAvailable = false;
      showSubscription("تعذر حفظ حالة الاشتراك على هذا الجهاز. فعّل التخزين المحلي في المتصفح ثم أعد تحميل الصفحة.");
      $("subscription-form").querySelector("button").disabled = true;
      $("subscription-code").disabled = true;
      return false;
    }
  }
  function refreshSubscriptionGate() {
    if (!state.subscriptionStorageAvailable) {
      showSubscription("تعذر استخدام التخزين المحلي في المتصفح، لذلك لا يمكن التحقق من الاشتراك.");
      return true;
    }
    if (state.subscriptionExpiresAt && state.subscriptionExpiresAt <= Date.now()) {
      state.subscriptionExpiresAt = 0;
      state.freeMessages = FREE_MESSAGE_LIMIT;
      if (!persistSubscription()) return true;
    }
    const required = !state.subscriptionExpiresAt && state.freeMessages >= FREE_MESSAGE_LIMIT;
    if (required) showSubscription();
    return required;
  }
  function recordFreeMessage() {
    if (state.subscriptionExpiresAt > Date.now()) return true;
    state.freeMessages = Math.min(FREE_MESSAGE_LIMIT, state.freeMessages + 1);
    return persistSubscription();
  }
  function clearSavedApiKey() {
    state.apiKey = "";
    $("api-key").value = "";
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    setStatus(false, "المفتاح غير مضاف");
  }
  function showView(view) {
    document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
    $(`${view}-view`).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
    if (view === "settings") $("api-key").value = state.apiKey;
  }
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("open-settings").addEventListener("click", () => showView("settings"));
  document.querySelectorAll("[data-go-chat]").forEach((btn) => btn.addEventListener("click", () => showView("chat")));

  function addMessage(role, content, extraClass = "") {
    $("welcome-panel").classList.add("hidden");
    const el = document.createElement("article");
    el.className = `message ${role} ${extraClass}`.trim();
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "أنت" : "بيمو";
    const body = document.createElement("div");
    body.textContent = content;
    el.append(label, body);
    $("conversation").appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return el;
  }
  function normalizeArabic(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0670\u0640\u200C\u200D]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ؤ]/g, "و")
      .replace(/[ئ]/g, "ي")
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF0-9\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function wordSimilarity(a, b) {
    if (a === b) return 1;
    if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 3) return 0;
    const grams = (value) => {
      const out = new Set();
      for (let i = 0; i < value.length - 1; i++) out.add(value.slice(i, i + 2));
      return out;
    };
    const aa = grams(a), bb = grams(b);
    let overlap = 0;
    aa.forEach((gram) => { if (bb.has(gram)) overlap++; });
    return (2 * overlap) / Math.max(1, aa.size + bb.size);
  }
  function getBookContext(subject, question) {
    const query = normalizeArabic(question);
    const stopWords = new Set(["من", "في", "على", "عن", "الى", "هذا", "هذه", "ذلك", "كيف", "ماذا", "اشرح", "لي", "درس", "كتاب", "صفحه", "اريد", "ما", "هو", "هي"]);
    const terms = [...new Set(query.split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w)))];
    if (!terms.length) return "";
    const matches = [];
    for (const book of state.books) {
      if (subject && book.subject !== subject) continue;
      const text = normalizeArabic(book.text);
      const words = [...new Set(text.split(/\s+/).filter(Boolean))];
      const metadata = normalizeArabic(`${book.subject || ""} ${book.book || ""} ${book.lesson || ""} ${book.grade || ""}`);
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) score += Math.min(4, (text.split(term).length - 1)) + 1;
        else if (term.length >= 3) {
          let best = 0;
          for (const word of words) {
            const sim = wordSimilarity(term, word);
            if (sim > best) best = sim;
            if (best >= 0.85) break;
          }
          if (best >= 0.32) score += best * 2;
        }
        if (metadata.includes(term)) score += 3;
      }
      if (query.length > 5 && text.includes(query)) score += 12;
      if (score > 0) matches.push({ book, score });
    }
    matches.sort((a, b) => b.score - a.score || Number(a.book.page || 0) - Number(b.book.page || 0));
    return matches.slice(0, 5).map(({book}) =>
      `الصف: ${book.grade || "الثاني الثانوي"}\nالمسار: ${book.track || "علمي"}\nالمادة: ${book.subject}\nالكتاب: ${book.book || "غير محدد"}\nالدرس/العنوان: ${book.lesson || "غير محدد"}\nرقم صفحة PDF: ${book.page || "غير محددة"}\nالنص المستخرج من المصدر:\n${String(book.text || "").slice(0, 2400)}`
    ).join("\n\n--- مقطع آخر من المصدر ---\n\n");
  }
  async function loadBooks() {
    // Book JSON format will be finalized after the user's ZIP is inspected.
    try {
      const response = await fetch("data/books/index.json", { cache: "no-store" });
      if (!response.ok) return;
      const index = await response.json();
      const entries = Array.isArray(index) ? index : (index.books || []);
      state.books = entries
        .filter((item) => item && typeof item.text === "string" && item.text.trim())
        .map((item) => ({
          ...item,
          subject: item.subject === "اللغة الإنجليزية" &&
            /تمارين|exercises?/i.test(item.book || "")
            ? "اللغة الإنجليزية - التمارين"
            : item.subject
        }))
        .filter((item) => SUBJECTS.includes(item.subject));
      if (state.books.length) {
        const bookCount = new Set(state.books.map((item) => `${item.subject}|${item.book}`)).size;
        $("book-status").textContent = `تم تحميل ${state.books.length} مقطعًا من ${bookCount} كتب مع تمييز المادة والصفحة`;
        renderSubjects();
      }
    } catch (_) {
      // Missing local index is expected before books are provided.
    }
  }
  function renderSubjects() {
    const container = $("subjects-list");
    if (!state.books.length) return;
    const unique = [...new Set(state.books.map((b) => b.subject).filter(Boolean))];
    container.innerHTML = "";
    unique.forEach((subject) => {
      const card = document.createElement("button");
      card.className = "quick-card";
      card.style.width = "100%";
      card.style.textAlign = "right";
      const count = state.books.filter((b) => b.subject === subject).length;
      card.innerHTML = `<span>▤</span><strong></strong><small></small>`;
      card.querySelector("strong").textContent = subject;
      card.querySelector("small").textContent = `${count} مقطعًا مفهرسًا`;
      card.addEventListener("click", () => { subjectSelect.value = subject; showView("chat"); });
      container.appendChild(card);
    });
  }

  $("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const apiKey = $("api-key").value.trim();
    const model = $("model-select").value.trim() || "openai/gpt-4o-mini";
    try {
      if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
      else localStorage.removeItem(API_KEY_STORAGE_KEY);
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      sessionStorage.setItem("bimo_model", model);
    } catch (error) {
      $("settings-message").textContent = "تعذر حفظ الإعدادات على هذا الجهاز. تحقق من إعدادات التخزين في المتصفح.";
      return;
    }
    state.apiKey = apiKey;
    state.model = model;
    setStatus(Boolean(state.apiKey), state.apiKey ? "المفتاح محفوظ على هذا الجهاز" : "المفتاح غير مضاف");
    $("settings-message").textContent = state.apiKey ? "تم حفظ المفتاح على هذا الجهاز حتى مسحه أو رفضه من OpenRouter." : "أدخل المفتاح أولًا.";
  });
  $("clear-key").addEventListener("click", () => {
    try {
      clearSavedApiKey();
      $("settings-message").textContent = "تم مسح المفتاح المحفوظ من هذا الجهاز.";
    } catch (error) {
      $("settings-message").textContent = "تعذر مسح المفتاح من التخزين المحلي.";
    }
  });
  $("toggle-key").addEventListener("click", () => {
    const input = $("api-key");
    input.type = input.type === "password" ? "text" : "password";
    $("toggle-key").textContent = input.type === "password" ? "إظهار" : "إخفاء";
  });

  $("subscription-code").addEventListener("input", (event) => {
    event.target.value = event.target.value
      .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
      .replace(/\D/g, "")
      .slice(0, 5);
  });
  $("subscription-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = $("subscription-code").value;
    if (!/^\d{5}$/.test(code) || code[2] !== "8") {
      $("subscription-message").textContent = "الرمز غير صحيح. أدخل خمسة أرقام، ويجب أن يكون الرقم الثالث 8.";
      $("subscription-code").focus();
      return;
    }
    state.freeMessages = 0;
    state.subscriptionExpiresAt = Date.now() + SUBSCRIPTION_DURATION_MS;
    if (!persistSubscription()) return;
    $("subscription-overlay").classList.add("hidden");
    $("subscription-code").value = "";
    $("subscription-message").textContent = "";
    addMessage("assistant", "تم تفعيل الاشتراك لمدة 30 يومًا. يمكنك متابعة التعلّم الآن.");
  });

  async function sendMessage(message) {
    const subject = subjectSelect.value;
    const lesson = $("lesson-input").value.trim();
    if (!message.trim() || state.busy) return;
    if (refreshSubscriptionGate()) return;
    const isFreeMessage = state.subscriptionExpiresAt <= Date.now();
    if (isFreeMessage && !recordFreeMessage()) return;
    const subscriptionRequiredAfterReply = isFreeMessage && state.freeMessages >= FREE_MESSAGE_LIMIT;
    addMessage("user", message);
    $("message-input").value = "";
    state.messages.push({ role: "user", content: message });
    if (!state.apiKey) {
      addMessage("assistant", "أنا معك! قبل أن أجيب باستخدام الذكاء الاصطناعي، أضف مفتاح OpenRouter من الإعدادات. يمكنك استكشاف الواجهة الآن، وبعد إضافة الكتب سأتمكن من الاستناد إلى المقاطع المتاحة. لا أريد أن أخمّن إجابة وأنسبها إلى كتابك.", "error");
      if (subscriptionRequiredAfterReply) showSubscription();
      return;
    }
    state.busy = true;
    $("send-button").disabled = true;
    const pending = addMessage("assistant", "أراجع سؤالك وأجهز الإجابة...");
    const bookContext = getBookContext(subject, `${lesson} ${message}`);
    const systemPrompt = `أنت بيمو، مساعد تعليمي ودود في العلاء أكاديمي لطلاب الصف الثاني الثانوي العلمي. تحدث بالعربية الواضحة وكن مشجعًا دون مبالغة. المادة المختارة: ${subject || "لم يحدد الطالب مادة"}. الدرس: ${lesson || "لم يحدد الطالب درسًا"}. \nقواعد صارمة: اقرأ بيانات المصدر مع كل مقطع والتزم بالمادة والكتاب المحددين. لا تخلط بين كتاب الطالب وكتاب التمارين أو بين المواد المختلفة. إذا كان سؤال الطالب عن مادة معينة، استخدم فقط المقاطع التي تحمل اسم تلك المادة. اجعل الحقائق المنسوبة للمنهج مستندة إلى المقاطع المسترجعة، واذكر اسم الكتاب ورقم الصفحة والدرس عند توفرها. لا تخترع اقتباسات أو أرقام صفحات. قد تحتوي بعض الصفحات الممسوحة ضوئيًا على أخطاء في استخراج الحروف؛ إذا بدا النص المسترجع مشوهًا أو لم يقدم دليلًا كافيًا، لا تخمّن، واطلب من الطالب إرسال صورة واضحة للصفحة أو كتابة عنوان الدرس. أمثلة الحياة اليومية مسموحة لكن ميّزها كأمثلة توضيحية. في المسائل اشرح الخطوات والقوانين والوحدات. شجع الطالب على المحاولة بنفسه. \nالمقاطع المسترجعة من الكتاب:\n${bookContext || "لا توجد مقاطع كتب مفهرسة حاليًا. لا تدّعِ أنك قرأت الكتاب ولا تنسب معلومات إلى المنهج. اطلب من الطالب تزويدك بنص الدرس أو انتظر إضافة الكتب."}`;
    const history = state.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${state.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": location.href,
          "X-Title": "Alaa Academy - Bimo"
        },
        body: JSON.stringify({
          model: state.model,
          messages: [{ role: "system", content: systemPrompt }, ...history],
          temperature: 0.5
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          try {
            clearSavedApiKey();
            $("settings-message").textContent = "رفض OpenRouter المفتاح؛ تمت إزالته من هذا الجهاز. أدخل مفتاحًا صالحًا.";
          } catch (error) {
            state.apiKey = "";
            setStatus(false, "مفتاح OpenRouter غير صالح");
          }
        }
        const detail = data?.error?.message || `رمز الخطأ ${response.status}`;
        throw new Error(detail);
      }
      const answer = data?.choices?.[0]?.message?.content;
      if (!answer) throw new Error("لم يصل رد نصي من النموذج.");
      pending.querySelector("div:last-child").textContent = answer;
      state.messages.push({ role: "assistant", content: answer });
    } catch (error) {
      pending.classList.add("error");
      pending.querySelector("div:last-child").textContent =
        `تعذر الحصول على إجابة هذه المرة. تحقق من المفتاح واسم النموذج والاتصال وحدود الاستخدام في OpenRouter.\nالتفاصيل: ${error.message}`;
    } finally {
      state.busy = false;
      $("send-button").disabled = false;
      if (subscriptionRequiredAfterReply) showSubscription();
    }
  }
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage($("message-input").value);
  });
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      $("message-input").value = button.dataset.prompt;
      $("message-input").focus();
      showView("chat");
    });
  });
  $("message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("chat-form").requestSubmit();
    }
  });

  let installPrompt = null;
  const installButton = $("install-app");
  const installStatus = $("install-status");
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  if (isInstalled) {
    installButton.classList.add("hidden");
  } else if (isIOS) {
    installButton.textContent = "طريقة التثبيت";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.textContent = "تثبيت التطبيق";
    installButton.classList.remove("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      installStatus.textContent = isIOS
        ? "افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية»."
        : "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
      installStatus.classList.remove("hidden");
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === "accepted") {
      installButton.classList.add("hidden");
      installStatus.textContent = "تم بدء تثبيت بيمو على جهازك.";
      installStatus.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    installButton.classList.add("hidden");
    installStatus.textContent = "تم تثبيت بيمو بنجاح.";
    installStatus.classList.remove("hidden");
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("تعذر تفعيل دعم العمل دون اتصال:", error);
    });
  }

  try {
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const legacyApiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY) || "";
    state.apiKey = savedApiKey || legacyApiKey;
    if (!savedApiKey && legacyApiKey) localStorage.setItem(API_KEY_STORAGE_KEY, legacyApiKey);
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    state.model = sessionStorage.getItem("bimo_model") || "openai/gpt-4o-mini";
  } catch (error) {
    state.apiKey = "";
    $("settings-message").textContent = "تعذر قراءة المفتاح المحفوظ. تحقق من إعدادات التخزين في المتصفح.";
  }
  try {
    const savedSubscription = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (savedSubscription) {
      const subscription = JSON.parse(savedSubscription);
      if (!Number.isInteger(subscription.freeMessages) ||
          subscription.freeMessages < 0 ||
          subscription.freeMessages > FREE_MESSAGE_LIMIT ||
          !Number.isFinite(subscription.expiresAt) ||
          subscription.expiresAt < 0) {
        throw new Error("بيانات الاشتراك المحفوظة غير صالحة.");
      }
      state.freeMessages = subscription.freeMessages;
      state.subscriptionExpiresAt = subscription.expiresAt;
    }
  } catch (error) {
    state.subscriptionStorageAvailable = false;
  }
  $("api-key").value = state.apiKey;
  $("model-select").value = state.model;
  setStatus(Boolean(state.apiKey), state.apiKey ? "المفتاح محفوظ على هذا الجهاز" : "المفتاح غير مضاف");
  refreshSubscriptionGate();
  window.setInterval(refreshSubscriptionGate, 60_000);
  loadBooks();
})();
