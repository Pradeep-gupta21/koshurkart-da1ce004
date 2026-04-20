import { Navigate } from "react-router-dom";

// Old apply page is now a thin redirect to the unified onboarding wizard.
const VendorApplyPage = () => <Navigate to="/vendor/apply" replace />;

export default VendorApplyPage;
