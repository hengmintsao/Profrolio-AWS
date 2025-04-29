# Profrolio-AWS
This is a portfolio website built with HTML, CSS, and JavaScript, and deployed on AWS.

### How does this work?
This is my personal portfolio project. However, this time the main focus is on leveraging various AWS cloud services to achieve the deployment and integration. Through this project, I aim to not only showcase my previous works but also demonstrate my ability to utilize AWS for hosting static websites, using S3, API Gateway, Lambda, DynamoDB and Simple Notification Service(SNS).


### Concept Map Flowchart
![Flowchart](https://github.com/user-attachments/assets/9c2f15eb-7a09-49a1-95c4-6137d97106db)

### Feature Accomplishment

- **Responsive design**
  The layout automatically adapts to the user’s screen size, delivering an optimal and seamless UI experience on any device.

- **Pure static front-end**
  Hosted on S3, no web servers to patch or scale.
  
- **Elastic serverless back-end**
  HTTP API + Lambda scales on demand with zero idle cost, handling traffic spikes automatically.
  
- **Near-zero running cost**
  Only pay for the tiny Lambda execution time; the rest is usage-based and free at low traffic.

- **Instant email alerts**
  Each submission triggers an SNS publish, this feature can instantly send and e-mail to me if there is a submit form triggered.

  Contact form submitted:
  ![contactFormSubmitted](https://github.com/user-attachments/assets/76d34575-3700-4c7c-9887-c44d17e5d1f2)

  Publish an Email to my email address:
  ![publishEmail](https://github.com/user-attachments/assets/302a78ac-f9d8-4813-ae09-74d3cbee4e33)


### Tech Stack
***Front End***
- Html
- Tailwind / DaisyUI
- JavaScript

***Back-End***
- AWS API Gateway + Lambda

***Database***
- Amazon DynamoDB

***Messaging***
- Amazon SNS

***Hosting / Cloud***
- AWS
