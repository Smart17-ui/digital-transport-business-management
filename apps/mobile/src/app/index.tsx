import { DriverHome } from '@/components/driver-home';
import { OwnerHome } from '@/components/owner-home';
import { useAuth } from '@/lib/auth';

/** Each person gets the home for their role in their business. */
export default function Home() {
  const { account, userId } = useAuth();
  const business = account?.business;
  if (!business || !userId) return null;
  return business.role === 'owner' ? <OwnerHome business={business} /> : <DriverHome business={business} userId={userId} />;
}
