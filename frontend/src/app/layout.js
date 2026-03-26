import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Petit_Formal_Script,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const elegantSerif = Cormorant_Garamond({
  variable: "--font-elegant-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const formalScript = Petit_Formal_Script({
  variable: "--font-formal-script",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "GDG ChatBot",
  description: "GDG Campus NTPU Chat Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${elegantSerif.variable} ${formalScript.variable}`}>
        {children}
      </body>
    </html>
  );
}
