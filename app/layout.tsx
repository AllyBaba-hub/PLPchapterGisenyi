import './globals.css'; // Ensure this exists for your Tailwind styles
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'PLP Gisenyi Chapter',
  description: 'Official member management portal for PLP Gisenyi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        {/* Global Header */}
        <header className="bg-white border-b p-4 text-center font-bold text-xl">
          PLP Gisenyi Chapter
        </header>

        {/* This is where your specific page content (Home, Admin, etc.) appears */}
        <main>{children}</main>

        {/* Global Footer */}
        <footer className="mt-20 py-6 text-center text-sm text-gray-500 border-t">
          © 2026 PLP Gisenyi Chapter. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
