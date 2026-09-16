export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <span
                className="mark"
                style={{
                  background: 'linear-gradient(135deg, var(--color-teal-600), var(--color-gold))',
                }}
              />
              cloudvote
            </div>
            <p style={{ fontSize: 13, color: '#a9c4ba', maxWidth: 260, lineHeight: 1.6 }}>
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
          <span>© {new Date().getFullYear()} CloudVote — demo environment</span>
          <span>v1.4.0</span>
        </div>
      </div>
    </footer>
  );
}