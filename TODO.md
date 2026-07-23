# Forgot / Reset Password - ✅ COMPLETED

## Backend
- [x] `authController.js` — added `forgotPassword` + `resetPassword` controllers (OTP: `1234`)
- [x] `routes/auth.js` — added `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`

## Frontend Web
- [x] `ForgotPassword.jsx` — phone input → success screen → auto-redirect to reset
- [x] `ResetPassword.jsx` — OTP + new password + confirm → success screen
- [x] `Login.jsx` — added "Forgot password?" link below password field
- [x] `App.js` — added routes for `/forgot-password` and `/reset-password`
- [x] `AuthContext.jsx` — added `forgotPassword` + `resetPassword` methods

## Frontend Mobile (React Native)
- [x] `ForgotPasswordScreen.js` — phone input → success screen → navigate to reset
- [x] `ResetPasswordScreen.js` — OTP + new password + confirm → success screen
- [x] `LoginScreen.js` — added "Forgot password?" link
- [x] `App.js` — added screens to navigation stack
- [x] `AuthContext.js` — added `forgotPassword` + `resetPassword` methods

