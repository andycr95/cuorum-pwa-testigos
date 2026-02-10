# Cuorum PWA - Testigos

Progressive Web App for poll watchers on election day.

## Features

- **Offline-first architecture** - Works without internet connection
- **Photo upload with compression** - E-14 form photos optimized for 2G/EDGE
- **Real-time sync** - Automatic sync when online
- **Multiple ballot support** - Handle multiple voting ballots (tarjetones)
- **IndexedDB storage** - Local data persistence
- **Service Worker** - Background sync and caching

## Tech Stack

- React 19
- TypeScript
- Vite
- TailwindCSS
- IndexedDB (idb library)
- Vite PWA Plugin
- Service Workers

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

Open http://localhost:5174

## Build

```bash
# Build for production (with PWA assets)
pnpm build

# Preview production build
pnpm preview
```

## PWA Features

- **Installable** - Can be installed on mobile devices
- **Offline-capable** - Works without internet
- **Background sync** - Data syncs when connection available
- **Push notifications** - (Future feature)

## Environment Variables

Create `.env` file:

```env
VITE_API_BASE_URL=https://api.app.cuorum.co/api
```

## Deploy

Deployed to **AWS Amplify** with auto-deploy on push to `main` branch.

### Setup AWS Amplify (First time):

1. Go to AWS Amplify Console
2. Connect repository: `andycr95/cuorum-pwa-testigos`
3. Amplify will auto-detect `amplify.yml` configuration
4. Deploy settings:
   - Framework: Vite
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Node version: 20

Preview deployments are automatically created for pull requests.

**PWA Support:** AWS Amplify has native support for PWAs with proper headers for service workers and manifest.json.

### Future: Native App

This PWA can evolve into React Native app for:
- iOS App Store
- Google Play Store
- Better native features (camera, biometrics, etc.)

## License

Private - All Rights Reserved
