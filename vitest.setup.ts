import { vi } from 'vitest'

vi.mock("@xterm/xterm");
vi.mock('@capacitor-community/native-audio')
vi.mock('@xterm/addon-fit')
vi.mock('@xterm/addon-search')
vi.mock('@xterm/addon-web-links')
vi.mock('@xterm/addon-webgl')
vi.mock('@xterm/addon-image')
vi.mock('@revenuecat/purchases-capacitor')
vi.mock('./src/ssh_session.ts')
vi.mock('./src/webrtc_session.ts')
