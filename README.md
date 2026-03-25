# PostCraft AI - LinkedIn Content Generator

A beautiful, modern LinkedIn post calendar generator with AI-powered content creation. Features a stunning web interface with smooth animations and a dedicated generator page for the best user experience.

## ✨ Features

### 🎨 **Beautiful Web Interface**
- Modern glass morphism design with gradient backgrounds
- Smooth animations and transitions
- Responsive design for all devices
- Clean, minimal UI inspired by modern web apps

### 🤖 **AI-Powered Content Creation**
- Uses Groq Cloud API with advanced language models
- Intelligent content generation based on your business context
- Auto-generated hashtags and engagement optimization
- Context-aware posts that match your brand voice

### 🎉 **Smart Content Types**
- **Festival Posts**: Themed content for holidays and special occasions
- **Business Posts**: Engaging content for regular business days
- **Industry-Specific**: Tailored content based on your industry
- **Multi-Format**: Various post styles and formats

### 🌍 **Global Support**
- Multi-country holiday support (US, UK, Canada, Australia, etc.)
- Localized content and cultural awareness
- Timezone and date format handling

### 📱 **Advanced User Experience**
- **Dedicated Generator Page**: Clean, step-by-step form interface
- **AI Bot Assistant**: Interactive chat for post improvements
- **Multiple View Options**: List view and calendar view
- **Real-time Analytics**: Engagement scoring and metrics
- **Export Capabilities**: PDF, CSV export options
- **Smart Editing**: Copy, edit, and AI-enhance posts
- **Mobile-Optimized**: Responsive design for all devices

### 🤖 **AI-Powered Features**
- **Interactive AI Chat**: Ask the AI to improve specific posts
- **Contextual Suggestions**: AI understands your business context
- **Real-time Improvements**: Apply AI suggestions instantly
- **Smart Analytics**: Engagement prediction and optimization
- **Natural Language**: Chat with AI in plain English

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/gnoknwgnng/incraft.git
cd incraft
npm install
```

### 2. Environment Setup
Create a `.env` file with your Groq API key:
```env
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Run the Application
```bash
npm start
```

Visit `http://localhost:3000` to access the beautiful web interface!

## 🎯 How to Use

### Web Interface (Recommended)
1. **Open** `http://localhost:3000` in your browser
2. **Click** "Generate LinkedIn Posts" button
3. **Fill** the form with your company details:
   - Date range for posts
   - Country for holidays
   - Company information
   - Industry and services
4. **Generate** and view your posts
5. **Interact with AI Bot** 🤖 to improve posts
6. **Switch views** between List and Calendar
7. **Export, copy, or edit** your content

### 🤖 Using the AI Assistant
1. **Click the AI bot button** (🤖) on any post
2. **Chat naturally**: "Make this more engaging" or "Add a call-to-action"
3. **Review AI suggestions** and explanations
4. **Apply changes** instantly with one click
5. **Continue chatting** for further improvements

## 🎬 Feature Showcase

### 🤖 AI Bot in Action
```
User: "Make this post more engaging"
AI: "I'll add emojis, a question, and a stronger call-to-action to boost engagement!"

User: "Add industry-specific hashtags"
AI: "I'll research and add relevant hashtags for your industry to increase reach."
```

### 📊 Analytics Dashboard
- **Character Count**: Optimal length tracking (100-300 chars recommended)
- **Hashtag Analysis**: Count and effectiveness scoring
- **Engagement Score**: AI-calculated engagement prediction (0-100%)
- **Content Type**: Festival vs Business post performance

### 👀 Multiple Views
- **📋 List View**: Detailed cards with full content and analytics
- **📅 Calendar View**: Monthly grid showing posts by date
- **🔄 Easy Switching**: Toggle between views instantly

### API Usage
The application also provides a REST API for developers:

### API Endpoints

#### POST /generate
Generate a LinkedIn post calendar

**Request Body:**
```json
{
    "startDate": "2025-10-01",
    "endDate": "2025-10-31", 
    "countryCode": "US",
    "companyName": "Your Company",
    "website": "https://yourwebsite.com",
    "services": ["Service 1", "Service 2"],
    "hashtags": ["hashtag1", "hashtag2"],
    "format": "json"
}
```

#### GET /countries
Get list of available countries

#### GET /holidays/:year/:country
Get holidays for specific year and country

## Example

Run the example:
```bash
node example.js
```

This will generate posts for October 1-10, 2025 using sample company data.

## Sample Output

### Festival Post
```
📅 October 14, 2025 (Tuesday) - FESTIVAL POST

🇺🇸 Happy Columbus Day! 🇺🇸

Celebrating this special day with gratitude and joy.

At AP&A SYSTEM LLP, we believe in celebrating milestones and traditions that bring us together:

🔧 IT Solutions for digital transformation
🔧 HR & Recruitment for building strong teams
🔧 Branding & Marketing for powerful presence
🔧 Social Media Management for meaningful connections

May this Columbus Day bring prosperity and success to all!

Visit: https://www.apasystemllp.com/services

#ColumbusDay #DigitalTransformation #BusinessGrowth #APASystem
```

### Business Post
```
📅 October 15, 2025 (Wednesday) - SERVICE SPOTLIGHT

💼 Highlighting our comprehensive business solutions today!

At AP&A SYSTEM LLP, we provide:

✨ IT Solutions for digital transformation
✨ HR & Recruitment for building strong teams
✨ Branding & Marketing for powerful presence
✨ Social Media Management for meaningful connections

Ready to elevate your business? Let's connect and explore opportunities!

Visit: https://www.apasystemllp.com/services

#DigitalTransformation #BusinessGrowth #APASystem
```

## Deployment

This application is ready for deployment on:
- Heroku
- Vercel
- AWS Lambda
- Google Cloud Functions
- Any Node.js hosting platform

## Country Codes

Common country codes supported:
- US (United States)
- GB (United Kingdom) 
- CA (Canada)
- AU (Australia)
- IN (India)
- DE (Germany)
- FR (France)

Use the `/countries` endpoint to get the full list.

## License

MIT