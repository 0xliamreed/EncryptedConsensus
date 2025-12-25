import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="brand">
          <div className="brand-mark">EC</div>
          <div className="brand-text">
            <p className="brand-title">Encrypted Consensus</p>
            <p className="brand-subtitle">Zama FHE predictions</p>
          </div>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
