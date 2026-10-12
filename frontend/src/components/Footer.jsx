import Logo from './Logo';
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <Logo size={26} wordmarkSize={15} variant="light" />
            </div>
            <p style={{ fontSize: 13, color: '#c9b0b4', maxWidth: 260, lineHeight: 1.6 }}>
              A trustworthy room for every voice — private ballots, an auditable ledger, and
              results you can verify yourself.
            </p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <a href="/">Overview</a>
            <a href="/vote">Vote</a>
            <a href="/results">Live results</a>
            <a href="/verify">Verify a receipt</a>
            <a href="/archive">Election archive</a>
            <a href="/status">System status</a>
          </div>

          <div className="footer-col">
            <h4>Trust</h4>
            <span style={{ display: 'block', fontSize: 13, color: '#cfe0d8', marginBottom: 10 }}>
              🔒 HTTPS encrypted
            </span>
            <span style={{ display: 'block', fontSize: 13, color: '#cfe0d8', marginBottom: 10 }}>
              ✓ MFA protected
            </span>
            <span style={{ display: 'block', fontSize: 13, color: '#cfe0d8' }}>
              📄 Append-only ledger
            </span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Ballotique — demo environment</span>
          <span>v1.4.0</span>
        </div>
      </div>
    </footer>
  );
}