# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Vidralo seriously. If you discover a security vulnerability, please follow these steps:

### Please DO NOT:

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before it has been addressed

### Please DO:

1. **Email us directly** at security@[your-domain].com with details of the vulnerability
2. Include steps to reproduce the vulnerability
3. Provide any relevant technical details (affected versions, potential impact, etc.)
4. Allow us reasonable time to address the issue before public disclosure

### What to expect:

- **Initial Response**: We will acknowledge your report within 48 hours
- **Status Updates**: We will keep you informed about our progress
- **Resolution**: We aim to release a fix within 7-14 days for critical vulnerabilities
- **Credit**: With your permission, we will credit you in the release notes

## Security Best Practices

When using Vidralo:

1. **Keep Updated**: Always use the latest version of Vidralo
2. **Download Safely**: Only download from official sources:
   - GitHub Releases: https://github.com/AIEraDev/vidralo/releases
   - Official Homebrew Tap: `brew tap AIEraDev/vidralo`
3. **Verify Downloads**: Check file signatures and checksums
4. **Respect Copyright**: Only download content you have permission to access
5. **Privacy**: Vidralo doesn't collect any user data, but be mindful of what you download

## Known Security Considerations

- Vidralo requires internet access to download videos and check for updates
- The app bundles yt-dlp and bgutil-pot executables which are kept up-to-date
- Auto-update feature uses HTTPS and signature verification
- No user data is transmitted to external servers

## Audit History

- No security audits have been conducted yet
- We welcome community security reviews

## Dependencies

Vidralo relies on:

- **yt-dlp**: Regularly updated for security and functionality
- **Tauri**: Web-view security is handled by the OS
- **Rust dependencies**: Automatically scanned for vulnerabilities via cargo-audit

We monitor and update dependencies regularly to address known vulnerabilities.

---

Thank you for helping keep Vidralo and its users safe!
