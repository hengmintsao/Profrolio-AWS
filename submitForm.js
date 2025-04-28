document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); 
  
      const data = {
        name: document.getElementById('Name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        message: document.getElementById('description').value,
      };
  
      try {
        const response = await fetch('https://你的API-Gateway網址', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });
  
        if (response.ok) {
          alert('Thank you! Your message has been sent.');
        } else {
          alert('Failed to send. Please try again.');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error sending form.');
      }
    });
  });
  