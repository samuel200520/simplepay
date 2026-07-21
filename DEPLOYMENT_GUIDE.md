# SimplePay Deployment Guide

## Overview
This guide will help you deploy SimplePay to Vercel (frontend) and Render (backend).

---

## Prerequisites
- GitHub repository: https://github.com/samuel200520/simplepay.git
- Vercel account (free tier available)
- Render account (free tier available)
- PostgreSQL database (Render provides free tier)

---

## Part 1: Deploy Backend to Render

### Step 1: Prepare Your Database
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New" → "PostgreSQL"
3. Fill in:
   - **Name**: `simplepay-db`
   - **Database**: `simplepay`
   - **User**: `simplepay`
   - **Plan**: Free
4. Click "Create Database"
5. **Save the connection details** (you'll need them later)

### Step 2: Deploy Backend
1. In Render Dashboard, click "New" → "Web Service"
2. Connect your GitHub repository: `samuel200520/simplepay`
3. Configure:
   - **Name**: `simplepay-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Plan**: Free
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`

4. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=5000
   DB_HOST=<your-render-db-host>
   DB_PORT=5432
   DB_NAME=simplepay
   DB_USER=<your-db-user>
   DB_PASSWORD=<your-db-password>
   JWT_SECRET=<generate-a-random-secret-key>
   ADMIN_PASSWORD=<your-admin-password>
   OPENAI_API_KEY=<optional-your-openai-key>
   ```

5. Click "Create Web Service"
6. Wait for deployment (2-3 minutes)
7. **Save your backend URL**: `https://simplepay-backend.onrender.com`

### Step 3: Verify Backend
Test your backend:
```bash
curl https://simplepay-backend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "SimplePay API running",
  "timestamp": "2024-..."
}
```

---

## Part 2: Deploy Frontend to Vercel

### Option A: Deploy via Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? **Your account**
   - Link to existing project? **No**
   - Project name? **simplepay** (or your choice)
   - In which directory is your code? **./** (root)
   - Want to override settings? **No**

5. Add environment variable:
   ```bash
   vercel env add REACT_APP_API_URL
   ```
   When prompted, enter: `https://simplepay-backend.onrender.com/api`

6. Redeploy with environment variable:
   ```bash
   vercel --prod
   ```

### Option B: Deploy via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository: `samuel200520/simplepay`
4. Configure:
   - **Framework Preset**: Create React App
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

5. Add Environment Variable:
   - **Name**: `REACT_APP_API_URL`
   - **Value**: `https://simplepay-backend.onrender.com/api`

6. Click "Deploy"
7. Wait for deployment (1-2 minutes)

### Step 3: Verify Frontend
1. Open your Vercel URL (e.g., `https://simplepay.vercel.app`)
2. Test login/register
3. Navigate to Dashboard → AI Coach tab
4. Try asking: "How much money do I have?"

---

## Part 3: Post-Deployment Configuration

### Update CORS (if needed)
The backend already has CORS enabled with `origin: true`, which should work. If you encounter CORS issues:

1. Go to Render → Your Backend Service
2. Click "Environment" tab
3. Add environment variable:
   ```
   CORS_ORIGIN=https://your-vercel-app.vercel.app
   ```

### Test All Features
- ✅ User registration/login
- ✅ Wallet linking (bank accounts, mobile money)
- ✅ Send money transfers
- ✅ View transaction history
- ✅ AI Coach chat
- ✅ Savings goals
- ✅ Financial insights dashboard

---

## Part 4: Custom Domain (Optional)

### For Vercel (Frontend)
1. Go to Vercel Dashboard → Your Project
2. Click "Settings" → "Domains"
3. Add your custom domain (e.g., `simplepay.app`)
4. Follow DNS configuration instructions

### For Render (Backend)
1. Go to Render Dashboard → Your Web Service
2. Click "Settings" → "Custom Domains"
3. Add your custom domain (e.g., `api.simplepay.app`)
4. Follow DNS configuration instructions

5. Update frontend environment variable:
   ```
   REACT_APP_API_URL=https://api.simplepay.app/api
   ```

---

## Part 5: Monitoring & Maintenance

### Render Backend
- **Logs**: Dashboard → Your Service → "Logs" tab
- **Metrics**: Dashboard → Your Service → "Metrics" tab
- **Auto-deploy**: Enabled by default (pushes to main branch trigger redeploy)

### Vercel Frontend
- **Deployments**: Dashboard → Your Project → "Deployments" tab
- **Analytics**: Dashboard → Your Project → "Analytics" tab
- **Auto-deploy**: Enabled by default

### Database
- **Backups**: Render PostgreSQL includes automatic backups
- **Connection pooling**: Enabled by default on Render

---

## Troubleshooting

### Backend Issues
1. **Database connection errors**: Verify DB credentials in Render environment variables
2. **Migration errors**: Check Render logs for SQL errors
3. **Memory issues**: Upgrade from Free to Starter plan (7-day trial available)

### Frontend Issues
1. **API connection errors**: Verify `REACT_APP_API_URL` environment variable
2. **Build failures**: Check Vercel build logs for errors
3. **White screen**: Check browser console for errors

### Common Solutions
```bash
# Clear cache and reinstall
cd backend && rm -rf node_modules package-lock.json && npm install

# Test locally first
cd backend && npm start

# Check database connection
psql -h <db-host> -U <db-user> -d simplepay
```

---

## Environment Variables Summary

### Backend (Render)
```
NODE_ENV=production
PORT=5000
DB_HOST=<from-render-database>
DB_PORT=5432
DB_NAME=simplepay
DB_USER=<from-render-database>
DB_PASSWORD=<from-render-database>
JWT_SECRET=<random-string-here>
ADMIN_PASSWORD=<your-secure-password>
OPENAI_API_KEY=<optional>
```

### Frontend (Vercel)
```
REACT_APP_API_URL=https://simplepay-backend.onrender.com/api
```

---

## Deployment Checklist

- [ ] PostgreSQL database created on Render
- [ ] Backend deployed to Render
- [ ] Backend environment variables configured
- [ ] Backend health check passing (`/api/health`)
- [ ] Frontend deployed to Vercel
- [ ] Frontend environment variable configured
- [ ] User registration tested
- [ ] Wallet linking tested
- [ ] Money transfer tested
- [ ] AI Coach chat tested
- [ ] Savings goals tested
- [ ] Financial insights displayed correctly

---

## Support

If you encounter issues:
1. Check Render logs: Dashboard → Your Service → Logs
2. Check Vercel logs: Dashboard → Your Project → Deployments → View Logs
3. Verify database connection in Render
4. Test API endpoints with Postman or curl

---

**Deployment completed successfully!** 🚀

Your SimplePay app is now live with:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://simplepay-backend.onrender.com`
- Database: PostgreSQL on Render