/* Supabase authentication and per-student learning data. */
(() => {
  const $ = (id) => document.getElementById(id);
  const config = window.ALAA_SUPABASE_CONFIG || {};
  const configured = Boolean(
    window.supabase?.createClient &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || "") &&
    typeof config.anonKey === "string" &&
    config.anonKey.length > 20 &&
    !/YOUR[_ -]|PLACEHOLDER/i.test(config.anonKey)
  );
  let client = null;
  let user = null;
  let profile = null;
  let authMode = "signin";
  let sessionTransition = 0;
  let passwordRecoveryPending = /(?:^|&)type=recovery(?:&|$)/u.test(location.hash.slice(1));

  function setAuthMessage(message, isError = false) {
    $("auth-message").textContent = message;
    $("auth-message").classList.toggle("is-error", isError);
  }
  function authErrorMessage(error) {
    const code = error?.code || "";
    const message = error?.message || "";
    if (code === "invalid_credentials") return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    if (code === "user_already_exists") return "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلًا من إنشاء حساب جديد.";
    if (code === "weak_password") return "كلمة المرور ضعيفة؛ استخدم كلمة مرور أطول وأكثر صعوبة.";
    if (code === "email_not_confirmed") return "تحقق من بريدك الإلكتروني واضغط رابط التأكيد قبل تسجيل الدخول.";
    if (/invalid login credentials/i.test(message)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    if (/already registered|already been registered/i.test(message)) return "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلًا من إنشاء حساب جديد.";
    if (/password.*(characters|length|short)/i.test(message)) return "كلمة المرور قصيرة؛ استخدم ٨ أحرف على الأقل.";
    if (/email not confirmed/i.test(message)) return "تحقق من بريدك الإلكتروني واضغط رابط التأكيد قبل تسجيل الدخول.";
    return `تعذر إكمال العملية: ${message || "تحقق من البيانات وإعدادات Supabase."}`;
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signUp = mode === "signup";
    $("auth-title").textContent = signUp ? "أنشئ حسابك الدراسي" : "مرحبًا بعودتك";
    $("auth-submit").textContent = signUp ? "إنشاء الحساب" : "تسجيل الدخول";
    $("auth-name").classList.toggle("hidden", !signUp);
    $("auth-name-label").classList.toggle("hidden", !signUp);
    $("auth-confirm-password").classList.toggle("hidden", !signUp);
    $("auth-confirm-label").classList.toggle("hidden", !signUp);
    $("auth-name").required = signUp;
    $("auth-confirm-password").required = signUp;
    $("auth-password").autocomplete = signUp ? "new-password" : "current-password";
    $("auth-switch-prompt").textContent = signUp ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟";
    $("toggle-auth-mode").textContent = signUp ? "تسجيل الدخول" : "إنشاء حساب";
    $("reset-password").classList.toggle("hidden", signUp);
    setAuthMessage("");
  }

  function showAuthenticatedApp() {
    $("auth-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
  }
  function showPasswordRecovery() {
    $("app-shell").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");
    $("auth-method-panel").classList.add("hidden");
    $("password-reset-form").classList.remove("hidden");
    $("auth-title").textContent = "استعادة كلمة المرور";
    $("auth-intro").textContent = "اختر كلمة مرور جديدة لحسابك.";
  }

  async function readOrCreateProfile(sessionUser) {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,display_name,grade,onboarding_completed,created_at")
      .eq("id", sessionUser.id)
      .maybeSingle();
    if (!error && data) return data;
    if (error && error.code !== "PGRST116") throw error;

    const { data: created, error: createError } = await client
      .from("profiles")
      .upsert({
        id: sessionUser.id,
        email: sessionUser.email || "",
        display_name: sessionUser.user_metadata?.display_name ||
          sessionUser.user_metadata?.full_name || ""
      }, { onConflict: "id", ignoreDuplicates: true })
      .select("id,email,display_name,grade,onboarding_completed,created_at")
      .maybeSingle();
    if (createError) throw createError;
    if (created) return created;
    const { data: existing, error: readError } = await client
      .from("profiles")
      .select("id,email,display_name,grade,onboarding_completed,created_at")
      .eq("id", sessionUser.id)
      .single();
    if (readError) throw readError;
    return existing;
  }

  async function applySession(session) {
    const transition = ++sessionTransition;
    if (!session?.user) {
      user = null;
      profile = null;
      $("app-shell").classList.add("hidden");
      $("auth-screen").classList.remove("hidden");
      return;
    }
    user = session.user;
    showAuthenticatedApp();
    try {
      const loadedProfile = await readOrCreateProfile(user);
      if (transition !== sessionTransition) return;
      profile = loadedProfile;
      $("profile-email").textContent = loadedProfile.email || user.email || "حساب الطالب";
      $("profile-grade").value = loadedProfile.grade || "";
      $("onboarding-grade").value = loadedProfile.grade || "";
      if (loadedProfile.onboarding_completed) {
        window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "chat" } }));
      } else {
        window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "onboarding" } }));
      }
    } catch (error) {
      console.error("تعذر تحميل ملف الطالب من Supabase:", error);
      if (transition !== sessionTransition) return;
      profile = null;
      $("profile-email").textContent = user.email || "تعذر تحميل بيانات الحساب.";
      $("onboarding-status").textContent = "تعذر تحميل ملفك الدراسي حاليًا. يمكنك استخدام المنصة، وقد تظهر المقدمة مجددًا عند تسجيل الدخول لاحقًا.";
      window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "onboarding" } }));
    }
    window.dispatchEvent(new CustomEvent("alaa:authenticated", { detail: { user, profile } }));
  }

  async function saveProfile(fields) {
    if (!client || !user) throw new Error("سجّل الدخول أولًا.");
    const { data, error } = await client
      .from("profiles")
      .update({
        ...(Object.hasOwn(fields, "display_name") ? { display_name: fields.display_name } : {}),
        ...(Object.hasOwn(fields, "grade") ? { grade: fields.grade } : {}),
        ...(Object.hasOwn(fields, "onboarding_completed") ? { onboarding_completed: fields.onboarding_completed } : {})
      })
      .eq("id", user.id)
      .select("id,email,display_name,grade,onboarding_completed,created_at")
      .single();
    if (error) throw error;
    profile = data;
    return data;
  }

  async function completeOnboarding() {
    const grade = $("onboarding-grade").value;
    if (!grade) {
      $("onboarding-status").textContent = "اختر صفك الدراسي؛ المكتبة المتاحة حاليًا للصف الثاني الثانوي.";
      return false;
    }
    try {
      if (user) await saveProfile({ grade, onboarding_completed: true });
      $("profile-grade").value = grade;
      $("onboarding-status").textContent = "";
      window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "chat" } }));
      return true;
    } catch (error) {
      console.error("تعذر حفظ إكمال المقدمة:", error);
      $("onboarding-status").textContent = "تعذر حفظ اختيارك على Supabase. ستتمكن من استخدام المنصة الآن، لكن قد تظهر المقدمة مجددًا عند تسجيل الدخول.";
      window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "chat" } }));
      return false;
    }
  }

  async function finishOnboardingForAction() {
    const grade = $("onboarding-grade").value || profile?.grade || "";
    if (!grade) {
      $("onboarding-status").textContent = "اختر صفك الدراسي أولًا لمتابعة استخدام بيمو.";
      return false;
    }
    try {
      if (user) await saveProfile({ grade, onboarding_completed: true });
      window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "chat" } }));
      return true;
    } catch (error) {
      console.error("تعذر حفظ إكمال المقدمة:", error);
      $("onboarding-status").textContent = "تعذر حفظ حالة المقدمة. يمكنك متابعة الوظيفة المطلوبة، وقد تظهر المقدمة مجددًا عند الدخول.";
      return true;
    }
  }

  async function saveLessonProgress(record) {
    if (!client || !user) return;
    const { error } = await client.from("lesson_progress").upsert({
      user_id: user.id,
      track: record.track,
      subject: record.subject,
      book: record.book,
      lesson: record.lesson,
      status: record.status || "studying",
      needs_review: Boolean(record.needsReview),
      last_studied_at: new Date().toISOString()
    }, { onConflict: "user_id,track,subject,book,lesson" });
    if (error) throw error;
  }

  async function saveQuizAttempt(record) {
    if (!client || !user) return;
    const { error } = await client.from("quiz_attempts").insert({
      user_id: user.id,
      track: record.track,
      subject: record.subject,
      book: record.book,
      lesson: record.lesson,
      question: record.question,
      student_answer: record.studentAnswer,
      feedback: record.feedback,
      correctness: record.correctness,
      score: record.score,
      incorrect_answers: record.incorrectAnswers || []
    });
    if (error) throw error;
  }

  async function loadProgress() {
    if (!client || !user) throw new Error("سجّل الدخول لعرض تقدمك.");
    const [lessons, attempts] = await Promise.all([
      client.from("lesson_progress")
        .select("track,subject,book,lesson,status,needs_review,last_studied_at")
        .eq("user_id", user.id)
        .order("last_studied_at", { ascending: false }),
      client.from("quiz_attempts")
        .select("subject,book,lesson,question,student_answer,feedback,correctness,score,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);
    if (lessons.error) throw lessons.error;
    if (attempts.error) throw attempts.error;
    return { lessons: lessons.data || [], attempts: attempts.data || [] };
  }

  async function initialize() {
    if (!configured) {
      $("auth-message").textContent = window.supabase?.createClient
        ? "يلزم إعداد عنوان مشروع Supabase ومفتاحه العام في supabase-config.js، ثم تطبيق supabase/schema.sql على المشروع."
        : "تعذر تحميل مكتبة Supabase من CDN. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.";
      document.querySelectorAll("#auth-form input, #auth-form button, #google-sign-in, #reset-password, #toggle-auth-mode")
        .forEach((control) => { control.disabled = true; });
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        passwordRecoveryPending = true;
        window.setTimeout(showPasswordRecovery, 0);
        return;
      }
      window.setTimeout(() => { void applySession(session); }, 0);
    });
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        setAuthMessage(`تعذر استعادة الجلسة: ${error.message}`, true);
        return;
      }
      if (passwordRecoveryPending && data.session) {
        user = data.session.user;
        showPasswordRecovery();
      } else {
        await applySession(data.session);
      }
      const authParams = new URLSearchParams(location.search);
      const oauthError = authParams.get("error_description") || authParams.get("error");
      if (oauthError) {
        const cancelled = /access_denied|cancel|denied/i.test(oauthError);
        setAuthMessage(cancelled
          ? "تم إلغاء تسجيل الدخول. يمكنك المحاولة مجددًا أو استخدام البريد الإلكتروني."
          : `تعذر إكمال تسجيل الدخول: ${oauthError}`, !cancelled);
      }
    } catch (error) {
      setAuthMessage(`تعذر الاتصال بـ Supabase لاستعادة الجلسة: ${error.message}`, true);
    }
  }

  $("toggle-auth-mode").addEventListener("click", () => {
    setAuthMode(authMode === "signin" ? "signup" : "signin");
  });
  $("toggle-auth-password").addEventListener("click", () => {
    const input = $("auth-password");
    input.type = input.type === "password" ? "text" : "password";
    $("toggle-auth-password").textContent = input.type === "password" ? "إظهار" : "إخفاء";
    $("toggle-auth-password").setAttribute("aria-pressed", String(input.type === "text"));
  });
  $("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    const button = $("auth-submit");
    button.disabled = true;
    setAuthMessage(authMode === "signup" ? "جارٍ إنشاء الحساب..." : "جارٍ تسجيل الدخول...");
    try {
      if (authMode === "signup") {
        if (password !== $("auth-confirm-password").value) throw new Error("كلمتا المرور غير متطابقتين.");
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: $("auth-name").value.trim() },
            emailRedirectTo: location.href
          }
        });
        $("password-reset-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!client) return;
          const password = $("new-password").value;
          if (password !== $("confirm-new-password").value) {
            setAuthMessage("كلمتا المرور غير متطابقتين.", true);
            return;
          }
          try {
            const { error } = await client.auth.updateUser({ password });
            if (error) throw error;
            passwordRecoveryPending = false;
            $("auth-method-panel").classList.remove("hidden");
            $("password-reset-form").classList.add("hidden");
            setAuthMessage("تم تحديث كلمة المرور بنجاح.");
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError) throw sessionError;
            await applySession(sessionData.session);
          } catch (error) {
            setAuthMessage(authErrorMessage(error), true);
          }
        });
        if (error) throw error;
        if (data.session) {
          setAuthMessage("تم إنشاء الحساب وتسجيل الدخول.");
          await applySession(data.session);
        } else {
          setAuthMode("signin");
          setAuthMessage("تم إنشاء الحساب. تحقق من بريدك الإلكتروني واضغط رابط التأكيد لتفعيل الحساب.");
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await applySession(data.session);
      }
    } catch (error) {
      setAuthMessage(authErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
  $("google-sign-in").addEventListener("click", async () => {
    if (!client) return;
    setAuthMessage("جارٍ تحويلك إلى Google...");
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.href }
      });
      if (error) setAuthMessage(`تعذر بدء تسجيل Google: ${error.message}`, true);
    } catch (error) {
      setAuthMessage(`تعذر الاتصال بـ Supabase: ${error.message}`, true);
    }
  });
  $("reset-password").addEventListener("click", async () => {
    if (!client) return;
    const email = $("auth-email").value.trim();
    if (!email) {
      setAuthMessage("أدخل بريدك الإلكتروني أولًا، ثم اضغط «نسيت كلمة المرور؟».", true);
      $("auth-email").focus();
      return;
    }
    setAuthMessage("جارٍ إرسال رابط الاستعادة...");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.href });
      setAuthMessage(error
        ? `تعذر إرسال رابط الاستعادة: ${error.message}`
        : "إذا كان البريد مسجلًا، فستصلك رسالة لاستعادة كلمة المرور.", Boolean(error));
    } catch (error) {
      setAuthMessage(`تعذر الاتصال لإرسال رابط الاستعادة: ${error.message}`, true);
    }
  });
  $("sign-out").addEventListener("click", async () => {
    if (!client) return;
    $("profile-status").textContent = "جارٍ تسجيل الخروج...";
    try {
      const { error } = await client.auth.signOut();
      $("profile-status").textContent = error ? `تعذر تسجيل الخروج: ${error.message}` : "تم تسجيل الخروج.";
    } catch (error) {
      $("profile-status").textContent = `تعذر الاتصال لتسجيل الخروج: ${error.message}`;
    }
  });
  $("save-profile").addEventListener("click", async () => {
    const grade = $("profile-grade").value;
    if (!grade) {
      $("profile-status").textContent = "اختر الصف الدراسي أولًا.";
      return;
    }
    try {
      await saveProfile({ grade });
      $("onboarding-grade").value = grade;
      $("profile-status").textContent = "تم حفظ الصف الدراسي.";
    } catch (error) {
      $("profile-status").textContent = `تعذر حفظ الصف: ${error.message}`;
    }
  });
  $("onboarding-start").addEventListener("click", () => { void completeOnboarding(); });
  $("reopen-onboarding").addEventListener("click", () => {
    $("onboarding-grade").value = profile?.grade || $("profile-grade").value;
    window.dispatchEvent(new CustomEvent("alaa:show-view", { detail: { view: "onboarding" } }));
  });

  window.AlaaPlatform = {
    configured,
    get client() { return client; },
    get user() { return user; },
    get profile() { return profile; },
    completeOnboarding,
    finishOnboardingForAction,
    saveProfile,
    saveLessonProgress,
    saveQuizAttempt,
    loadProgress,
    signOut: () => client?.auth.signOut()
  };
  void initialize();
})();
