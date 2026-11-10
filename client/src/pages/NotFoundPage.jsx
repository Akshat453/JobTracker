import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState, Button } from '../components/ui/index.js';

export default function NotFoundPage() {
  return (
    <EmptyState icon={Compass} title="Page not found" description="The page you're looking for doesn't exist or was moved."
      action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>} className="py-24" />
  );
}
