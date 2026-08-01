import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KSPDB Fault Detection & Localization System',
  description: 'Karnataka State Power Distribution Board Real-Time Fault Localization Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
