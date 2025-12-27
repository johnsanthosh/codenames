# Firebase Setup Guide

Step-by-step instructions to set up Firebase for the Codenames multiplayer game.

## Step 1: Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or "Add project")
3. Enter project name: `codenames` (or any name you like)
4. Click **Continue**
5. Disable Google Analytics (optional, not needed for this app)
6. Click **Create project**
7. Wait for project creation, then click **Continue**

## Step 2: Enable Google Authentication

1. In the Firebase console sidebar, click **Build** → **Authentication**
2. Click **Get started**
3. In the "Sign-in method" tab, click **Google**
4. Toggle **Enable** to ON
5. Select your **Project support email** (your email)
6. Click **Save**

## Step 3: Create Realtime Database

1. In the sidebar, click **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose a location (pick one close to you, e.g., `us-central1`)
4. Click **Next**
5. Select **Start in test mode** (we'll set proper rules later)
6. Click **Enable**

After creation, click the **Rules** tab and replace the rules with:

```json
{
  "rules": {
    "rooms": {
      ".read": "auth != null",
      "$roomCode": {
        ".write": "auth != null && (!data.exists() && auth.token.email == 'YOUR_EMAIL@gmail.com' || data.exists())"
      }
    }
  }
}
```

**Important:** Replace `YOUR_EMAIL@gmail.com` with your actual email address.

**What these rules do:**
- Anyone signed in can **read** all rooms
- Only **your email** can **create** new rooms
- Once a room exists, anyone signed in can **update** it (join, play, etc.)

Click **Publish** to save.

## Step 4: Get Firebase Config

1. Click the **gear icon** (⚙️) next to "Project Overview" in sidebar
2. Click **Project settings**
3. Scroll down to **"Your apps"** section
4. Click the **Web icon** (`</>`) to add a web app
5. Enter app nickname: `codenames-web`
6. Click **Register app**
7. You'll see a code block with `firebaseConfig` - copy those values

It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "codenames-xxxxx.firebaseapp.com",
  databaseURL: "https://codenames-xxxxx-default-rtdb.firebaseio.com",
  projectId: "codenames-xxxxx",
  storageBucket: "codenames-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

## Step 5: Configure Your App

1. In your terminal, copy the example env file:

```bash
cp .env.example .env
```

2. Open `.env` in your editor and fill in the values from Firebase:

```
VITE_FIREBASE_API_KEY=AIzaSyB...
VITE_FIREBASE_AUTH_DOMAIN=codenames-xxxxx.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://codenames-xxxxx-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=codenames-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=codenames-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef...

# Your email - only you can create games
VITE_ADMIN_EMAIL=your_email@gmail.com
```

**Important:** The `VITE_ADMIN_EMAIL` must match the email in your Firebase Database Rules.

## Step 6: Run the App

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Troubleshooting

### "Firebase: Error (auth/unauthorized-domain)"

If you see this error when trying to sign in:

1. Go to Firebase Console → Authentication → Settings
2. Click the **Authorized domains** tab
3. Add `localhost` if not already present

### "Permission denied" errors

Make sure your database rules are set correctly (see Step 3) and that you're signed in.

### Google Sign-In popup blocked

- Allow popups for localhost in your browser
- Or try a different browser

---

You're all set! Create a game and share the room code with friends to play.
