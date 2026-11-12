import LegalDocument from "../../components/LegalDocument";
import { LEGAL_CONFIG, PRIVACY_POLICY } from "../../constants/legal";

// Public screen: reachable before sign-in (the root guard allows /legal/*)
export default function PrivacyScreen() {
  return <LegalDocument title="Privacy Policy" sections={PRIVACY_POLICY} url={LEGAL_CONFIG.privacyUrl} />;
}