export const metadata = {
  title: "Roster Manager",
  description: "Project rostering and capacity planning tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#f9fafb" }}>
        {children}
      </body>
    </html>
  );
}
