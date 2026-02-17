import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ClientProviders from "@/providers/ClientProviders";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veil — Private Transactions on Starknet",
  description:
    "Confidential ERC20 transfers using ElGamal encryption and STARK proofs. Deposit, transfer, and withdraw privately.",
};

// Inline script to suppress extension errors before React hydrates.
const suppressExtensionErrors = `
(function(){
  var orig=window.onerror;
  window.onerror=function(m,s){
    if(s&&s.indexOf('chrome-extension://')!==-1)return true;
    if(orig)return orig.apply(this,arguments);
    return false;
  };
  window.addEventListener('error',function(e){
    if(e.filename&&e.filename.indexOf('chrome-extension://')!==-1){
      e.stopImmediatePropagation();e.preventDefault();
    }
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var s=(e.reason&&e.reason.stack)||'';
    var m=(e.reason&&e.reason.message)||'';
    if(s.indexOf('chrome-extension://')!==-1||m.indexOf('MetaMask')!==-1){
      e.preventDefault();
    }
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/veil-logo.svg" type="image/svg+xml" />
        <script dangerouslySetInnerHTML={{ __html: suppressExtensionErrors }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
