const form = document.querySelector("#profile-registration-form");

if (form) {
  const submitButton = form.querySelector('button[type="submit"]');
  const formStatus = form.querySelector("#form-status");
  let registrationStarted = false;

  function trackRegistrationEvent(eventName, properties = {}, options = {}) {
    return window.siteAnalytics?.track(eventName, properties, options) || Promise.resolve(false);
  }

  function markRegistrationStarted(event) {
    if (registrationStarted || event.target.closest(".honeypot-field")) return;
    registrationStarted = true;
    trackRegistrationEvent("registration_started");
  }

  form.addEventListener("input", markRegistrationStarted);
  form.addEventListener("change", markRegistrationStarted);

  const fieldRules = [
    {
      name: "region",
      wrapper: form.querySelector('[data-field="region"]'),
      controls: () => [form.elements.region],
      focusTarget: () => form.elements.region,
      validate: () => form.elements.region.value !== "",
      message: "활동 가능한 지역을 선택해 주세요.",
    },
    {
      name: "major",
      wrapper: form.querySelector('[data-field="major"]'),
      controls: () => [form.elements.major],
      focusTarget: () => form.elements.major,
      validate: () => form.elements.major.value.trim() !== "",
      message: "미술 전공 분야를 입력해 주세요.",
    },
    {
      name: "career",
      wrapper: form.querySelector('[data-field="career"]'),
      controls: () => [...form.querySelectorAll('input[name="career"]')],
      focusTarget: () => form.querySelector('input[name="career"]'),
      validate: () => Boolean(form.querySelector('input[name="career"]:checked')),
      message: "관련 경력을 선택해 주세요.",
    },
    {
      name: "childTeaching",
      wrapper: form.querySelector('[data-field="childTeaching"]'),
      controls: () => [...form.querySelectorAll('input[name="childTeaching"]')],
      focusTarget: () => form.querySelector('input[name="childTeaching"]'),
      validate: () => Boolean(form.querySelector('input[name="childTeaching"]:checked')),
      message: "아동 수업 가능 여부를 선택해 주세요.",
    },
    {
      name: "email",
      wrapper: form.querySelector('[data-field="email"]'),
      controls: () => [form.elements.email],
      focusTarget: () => form.elements.email,
      validate: () => form.elements.email.value.trim() !== "" && form.elements.email.validity.valid,
      message: () =>
        form.elements.email.value.trim() === ""
          ? "이메일을 입력해 주세요."
          : "올바른 이메일 형식으로 입력해 주세요.",
    },
    {
      name: "consent",
      wrapper: form.querySelector('[data-field="consent"]'),
      controls: () => [form.elements.consent],
      focusTarget: () => form.elements.consent,
      validate: () => form.elements.consent.checked,
      message: "이메일 안내 수신에 동의해 주세요.",
    },
  ];

  function errorElement(rule) {
    return rule.wrapper.querySelector(".field-error");
  }

  function setFieldError(rule, message) {
    const error = errorElement(rule);
    const hasError = Boolean(message);

    rule.wrapper.classList.toggle("is-invalid", hasError);
    error.textContent = message || "";
    error.hidden = !hasError;

    for (const control of rule.controls()) {
      control.setAttribute("aria-invalid", String(hasError));
    }
  }

  function validateRule(rule) {
    const valid = rule.validate();
    const message = valid
      ? ""
      : typeof rule.message === "function"
        ? rule.message()
        : rule.message;

    setFieldError(rule, message);
    return valid;
  }

  function validateForm() {
    let firstInvalidRule = null;

    for (const rule of fieldRules) {
      if (!validateRule(rule) && !firstInvalidRule) {
        firstInvalidRule = rule;
      }
    }

    return firstInvalidRule;
  }

  function focusInvalidRule(rule) {
    const target = rule.focusTarget();
    if (!target) return;

    rule.wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.focus({ preventScroll: true }), 220);
  }

  for (const rule of fieldRules) {
    for (const control of rule.controls()) {
      const eventName = control.matches('input[type="text"], input[type="email"]') ? "input" : "change";
      control.addEventListener(eventName, () => {
        if (rule.wrapper.classList.contains("is-invalid")) {
          validateRule(rule);
        }
      });
    }
  }

  async function submitRegistration(payload) {
    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "등록 정보를 저장하지 못했습니다.");
      error.fields = result.fields || null;
      error.status = response.status;
      throw error;
    }

    return result;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formStatus.hidden = true;
    trackRegistrationEvent("registration_submit_clicked");

    const firstInvalidRule = validateForm();
    if (firstInvalidRule) {
      trackRegistrationEvent("registration_validation_failed", { field: firstInvalidRule.name });
      focusInvalidRule(firstInvalidRule);
      return;
    }

    const data = new FormData(form);
    const payload = {
      region: data.get("region"),
      major: String(data.get("major") || "").trim(),
      career: data.get("career"),
      childTeaching: data.get("childTeaching"),
      email: String(data.get("email") || "").trim(),
      consent: data.get("consent") === "on",
      website: String(data.get("website") || ""),
    };

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = "등록 중...";

    try {
      await submitRegistration(payload);
      await trackRegistrationEvent("registration_succeeded");
      window.location.assign("./3-complete.dc.html");
    } catch (error) {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.textContent = originalButtonText;

      if (error.fields) {
        let firstInvalidRule = null;
        for (const rule of fieldRules) {
          const message = error.fields[rule.name];
          if (message) {
            setFieldError(rule, message);
            firstInvalidRule ||= rule;
          }
        }
        if (firstInvalidRule) {
          trackRegistrationEvent("registration_validation_failed", { field: firstInvalidRule.name });
          focusInvalidRule(firstInvalidRule);
          return;
        }
      }

      trackRegistrationEvent("registration_failed", {
        reason: error.status >= 500 ? "server" : error.status ? "unknown" : "network",
      });

      formStatus.textContent = error.message || "등록 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
      formStatus.hidden = false;
      formStatus.focus();
    }
  });
}
