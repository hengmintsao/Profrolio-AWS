document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  const submitButton = form.querySelector('button[type="submit"]');
  const status = document.getElementById('form-status');
  let pendingSubmission;
  try {
    pendingSubmission = JSON.parse(sessionStorage.getItem('portfolio.pendingContact'));
  } catch {
    pendingSubmission = null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const apiUrl = window.APP_CONFIG?.API_URL;
    if (!apiUrl) {
      status.textContent = 'The contact form is not configured yet.';
      return;
    }
    submitButton.disabled = true;
    status.textContent = 'Sending...';

    try {
      const data = {
        name: document.getElementById('Name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        message: document.getElementById('description').value,
        website: document.getElementById('website').value,
      };
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      // Retain the key across uncertain failures without storing contact details.
      if (!pendingSubmission || pendingSubmission.fingerprint !== fingerprint) {
        pendingSubmission = { key: crypto.randomUUID(), fingerprint };
        try {
          sessionStorage.setItem('portfolio.pendingContact', JSON.stringify(pendingSubmission));
        } catch {
          // In-memory retry still works when browser storage is unavailable.
        }
      }
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingSubmission.key,
        },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        form.reset();
        pendingSubmission = null;
        try {
          sessionStorage.removeItem('portfolio.pendingContact');
        } catch {
          // Storage cleanup failure does not change acceptance.
        }
        status.textContent = 'Thank you! Your message has been received.';
      } else {
        status.textContent = response.status === 409
          ? 'This submission key was already used. Change your message before submitting again.'
          : 'Failed to send. Please try again.';
      }
    } catch {
      status.textContent = 'Error sending form. Please try again later.';
    } finally {
      submitButton.disabled = false;
    }
  });
});
