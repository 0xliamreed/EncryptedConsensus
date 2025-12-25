import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Encrypted Consensus',
  projectId: '510d48d1a0cfe691d19fbd2d80589385',
  chains: [sepolia],
  ssr: false,
});
