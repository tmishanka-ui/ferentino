import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="hello">
      <h2>Page not found</h2>
      <p>There is nothing at this address. <Link href="/" style={{ textDecoration: 'underline' }}>Back to the home page</Link>.</p>
    </div>
  );
}
