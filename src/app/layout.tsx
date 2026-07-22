import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Unified Comms',
  description: 'All your messaging apps in one place',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-hidden h-screen w-screen" style={{ background: 'transparent' }}>
        {children}
      </body>
    </html>
  );
}
