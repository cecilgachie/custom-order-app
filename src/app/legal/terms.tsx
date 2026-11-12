import LegalDocument from "../../components/LegalDocument";
import { LEGAL_CONFIG, TERMS_OF_SERVICE } from "../../constants/legal";

// Public screen: reachable before sign-in (the root guard allows /legal/*)
export default function TermsScreen() {
  return <LegalDocument title="Terms of Service" sections={TERMS_OF_SERVICE} url={LEGAL_CONFIG.termsUrl} />;
}