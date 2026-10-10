import ApplicationShell from '../components/ApplicationShell';
import './globals.css';

export const metadata = {
  title: { default: 'Atlas', template: '%s | Atlas' },
  description: 'A shared workspace for AI infrastructure sales and technical planning.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><ApplicationShell>{children}</ApplicationShell></body>
    </html>
  );
}
