document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('contact-form');
    const submitButton = form.querySelector('button[type="submit"]');
    const status = document.getElementById('form-status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const apiUrl = window.APP_CONFIG?.API_URL;
      if (!apiUrl) {
        status.textContent = 'The contact form is not configured yet.';
        return;
      }

      const data = {
        name: document.getElementById('Name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        message: document.getElementById('description').value,
        website: document.getElementById('website').value,
      };

      submitButton.disabled = true;
      status.textContent = 'Sending...';

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          form.reset();
          status.textContent = 'Thank you! Your message has been received.';
        } else {
          status.textContent = 'Failed to send. Please try again.';
        }
      } catch (error) {
        console.error('Error:', error);
        status.textContent = 'Error sending form. Please try again later.';
      } finally {
        submitButton.disabled = false;
      }
    });
  });
