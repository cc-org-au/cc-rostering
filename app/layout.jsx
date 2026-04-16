import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "../lib/ThemeContext";

export const metadata = {
  title: "Roster Manager",
  description: "Project rostering and capacity planning tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="app-body">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
