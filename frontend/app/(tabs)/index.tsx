import { useAuth } from "@/src/auth";
import { AdminHome } from "@/src/components/home-admin";
import { CustomerHome } from "@/src/components/home-customer";
import { PartnerHome } from "@/src/components/home-partner";

export default function Home() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminHome />;
  if (user?.role === "partner") return <PartnerHome />;
  return <CustomerHome />;
}
