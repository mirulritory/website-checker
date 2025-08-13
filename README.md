# 🌐 SitePulse - Website Status Monitoring System

[![Node.js](https://img.shields.io/badge/Node.js-16.0.0+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18.2-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-8.11.3-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**SitePulse** is a real-time website monitoring application that provides instant notifications about website availability, performance metrics, and status changes. Built with Node.js, Express, and PostgreSQL, it offers a robust solution for businesses and developers to monitor their web assets.

## 🎥 Demo Video

Watch SitePulse in action! See how easy it is to monitor websites and receive instant notifications.

[![SitePulse Demo](https://img.shields.io/badge/📹-Watch%20Demo%20Video-red?style=for-the-badge&logo=youtube)](YOUR_YOUTUBE_LINK_HERE)

**Demo Highlights:**
- ✨ User registration and login process
- 🔍 Adding websites to monitor
- 📊 Real-time dashboard updates
- 📱 Telegram notification system
- 📈 Performance metrics tracking
- 🛠️ Advanced monitoring features

## ✨ Features

### 🔍 **Real-time Monitoring**
- **Instant Status Checks**: Monitor websites every 10 seconds for real-time updates
- **Multi-Status Support**: Detect online, offline, and maintenance states
- **Performance Metrics**: Track response time, latency, and SSL certificate status
- **DNS Resolution**: Comprehensive domain health checking

### 📱 **Smart Notifications**
- **Telegram Integration**: Instant alerts via Telegram bot
- **Status Change Detection**: Notifications only when status changes occur
- **Rich Information**: Includes URL, status, latency, and user details
- **Customizable Alerts**: Tailored notification messages

### 🛡️ **Security & Authentication**
- **JWT Authentication**: Secure user login and session management
- **Password Encryption**: Bcrypt hashing for enhanced security
- **User Management**: Individual user accounts with role-based access
- **Secure API**: Protected endpoints with token validation

### 📊 **Dashboard & Analytics**
- **Real-time Dashboard**: Live monitoring status and controls
- **Historical Data**: Track website performance over time
- **Top URLs**: View most monitored websites
- **User Profiles**: Personalized monitoring experience

### 🔧 **Advanced Monitoring**
- **Planned Maintenance**: Schedule and manage maintenance windows
- **Agent Health Monitoring**: Track monitoring agent performance
- **Consecutive Failure Detection**: Smart offline status detection
- **SSL Certificate Monitoring**: Track certificate expiration dates

## 🚀 Quick Start

### Prerequisites
- Node.js 16.0.0 or higher
- PostgreSQL 12.0 or higher
- Telegram Bot Token (for notifications)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/sitepulse.git
   cd sitepulse
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   JWT_SECRET=your_jwt_secret_here
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   DATABASE_URL=postgresql://username:password@localhost:5432/sitepulse
   ```

4. **Set up the database**
   ```bash
   # Create database and tables (see database setup section)
   ```

5. **Start the application**
   ```bash
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 🗄️ Database Setup

### PostgreSQL Configuration
```sql
-- Create database
CREATE DATABASE sitepulse;

-- Connect to database and run the following tables:

-- Users table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    phone_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monitors table
CREATE TABLE monitors (
    monitor_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    url VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Status history table
CREATE TABLE status_history (
    history_id SERIAL PRIMARY KEY,
    monitor_id INTEGER REFERENCES monitors(monitor_id),
    status VARCHAR(20) NOT NULL,
    latency INTEGER,
    response_code INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🏗️ Architecture

### **Backend Components**
- **Express Server**: RESTful API endpoints and WebSocket support
- **Website Status Agent**: Intelligent monitoring engine with health tracking
- **Authentication System**: JWT-based user management
- **Database Layer**: PostgreSQL with connection pooling
- **Notification Service**: Telegram bot integration

### **Frontend Components**
- **Dashboard**: Main monitoring interface
- **Authentication Pages**: Login and registration
- **Monitoring Interface**: Real-time status display
- **History View**: Historical performance data
- **Profile Management**: User settings and preferences

### **Key Technologies**
- **Backend**: Node.js, Express.js, WebSocket
- **Database**: PostgreSQL with pg driver
- **Authentication**: JWT, bcryptjs
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Real-time**: WebSocket for live updates
- **Notifications**: Telegram Bot API

## 📱 API Endpoints

### Authentication
- `POST /api/signup` - User registration
- `POST /api/signin` - User login

### Monitoring
- `GET /api/monitors` - Get user's active monitors
- `POST /api/monitors` - Create new monitor
- `PUT /api/monitors/:id` - Update monitor settings
- `DELETE /api/monitors/:id` - Remove monitor

### Status
- `GET /api/status/:url` - Check specific URL status
- `GET /api/history/:monitorId` - Get monitoring history

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | `your_jwt_secret` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token | Required |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | Required |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |

### Monitoring Settings
- **Check Interval**: 10 seconds (configurable)
- **Timeout**: 30 seconds per check
- **Retry Attempts**: 3 consecutive failures
- **SSL Verification**: Enabled by default

## 📊 Monitoring Features

### **Status Detection**
- **Online**: Website responds within normal parameters
- **Offline**: Website is unreachable or returns errors
- **Maintenance**: Planned downtime or maintenance mode
- **Slow**: Response time exceeds thresholds

### **Performance Metrics**
- **Response Time**: Total time to receive response
- **Latency**: Network round-trip time
- **SSL Status**: Certificate validity and expiration
- **DNS Resolution**: Domain name resolution time

## 🚀 Deployment

### **Local Development**
```bash
npm run dev
```

### **Production Deployment**
```bash
npm start
```

### **Docker Deployment** (Coming Soon)
```bash
docker build -t sitepulse .
docker run -p 3000:3000 sitepulse
```

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### **Development Setup**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Express.js** team for the excellent web framework
- **PostgreSQL** community for the robust database system
- **Telegram** for the bot API platform
- **Node.js** community for the runtime environment

## 📞 Support

If you have any questions or need help:
- **Issues**: [GitHub Issues](https://github.com/yourusername/sitepulse/issues)
- **Documentation**: [Wiki](https://github.com/yourusername/sitepulse/wiki)
- **Email**: your.email@example.com

---

**Made with ❤️ by [Your Name]**

*SitePulse - Keeping your websites healthy, one check at a time.*
