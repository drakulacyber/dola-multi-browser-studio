# 🎬 Dola Multi-Browser Studio

**All-in-One Electron App: Dual Browser + AI Proxy + Video Gateway + Skill/Extension Manager**

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    DOLA MULTI-BROWSER STUDIO                     │
│                        (Electron Shell)                          │
├──────────────┬──────────────────┬────────────────────────────────┤
│  PANEL KIRI  │   PANEL TENGAH    │       PANEL KANAN              │
│  Google AI   │    Dola Chat      │  Tab: Chat (DolaProxy)         │
│   Studio     │      Web          │  Tab: Video (Dola Studio)      │
│              │                   │  Tab: Skills / Extensions      │
│              │                   │  Tab: Batch (Flow Studio)      │
└──────────────┴──────────────────┴────────────────────────────────┘
```

## Backend Services

| Port | Service | Language | Function |
|------|---------|----------|----------|
| `8317` | DolaProxy | Node.js | OpenAI-compatible chat/image/video API |
| `8000` | Dola Studio | Python | Video rendering + no watermark |
| `5173` | DolaFlow | Node.js/Vite | Batch video production UI |

## Quick Start

### 1. Clone the backend repos

```bash
git clone https://github.com/realx94/DolaProxy.git backend/dola-proxy
git clone https://github.com/bonnhatnguyen/dola-render-gateway.git backend/dola-studio
# git clone <dolaflow-repo> backend/dola-flow
```

### 2. Install dependencies

```powershell
.\scripts\install.ps1
```

### 3. Configure environment

Edit `.env` with your API keys and paths.

### 4. Run

```bash
npm start
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+1` | Focus Google AI Studio panel |
| `Ctrl+2` | Focus Dola Chat panel |
| `Ctrl+3` | Focus Dola Studio panel |

## Skills

Place skill directories in `skills/`. Each skill must contain a `SKILL.md` file.
Import via the UI (Skills tab → Import) or by copying directly into the `skills/` folder.

## Extensions

Place Chrome extension directories in `extensions/`.
They are loaded automatically on startup and can be managed from the Extensions tab.

## Building

```bash
npm run build
# Output: dist/Dola Multi-Browser Studio Setup x.x.x.exe
```

## License

Private project.
