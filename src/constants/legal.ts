/**
 * Legal text shown in the app (Profile > Privacy Policy / Terms) and
 * published on the web. EDIT THE CONFIG BELOW before you launch.
 *
 * This is a starting template written for how the app really works. It is
 * not legal advice: have a Kenyan lawyer review it before release.
 */
export const LEGAL_CONFIG = {
  businessName: "Vatican Cake Point",
  contactEmail: "YOUR-EMAIL@YOURDOMAIN.COM", // <-- replace with a real, monitored address
  lastUpdated: "9 November 2026", // <-- update whenever you change the text
  // Your decision. Edit to match what you will really do:
  cancellationPolicy:
    "Contact us as soon as possible to change or cancel an order. Once we have started baking, we may not be able to refund what you have paid. If we cancel an order, we will refund what you paid for it.",
  // Fill in after you publish the web versions (see web/ folder). Shown as a "View online" button.
  privacyUrl: "",
  termsUrl: "",
  deleteAccountUrl: "",
};

/** Saved with a customer's account when they accept, so you know which text they agreed to. */
export const TERMS_VERSION = "2026-11-09";

export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };

export const PRIVACY_POLICY: LegalSection[] = [
  {
    heading: "Who we are",
    paragraphs: [
      "" + LEGAL_CONFIG.businessName + " (\"we\", \"us\") is a cake business in Kenya. This policy explains what personal information the " + LEGAL_CONFIG.businessName + " app collects, why we collect it, who we share it with, and the choices you have.",
      "If you have any questions, contact us at " + LEGAL_CONFIG.contactEmail + ".",
    ],
  },
  {
    heading: "Information we collect",
    bullets: [
      "Account details: your email address, your password (stored securely by our sign-in provider, never in plain text), your username and your name. If you sign in with Google, we receive your name and email address from Google.",
      "Order details: the cakes you order and your choices (size, weight, flavor, colors, inscription text, design notes, event date and number of guests), prices, order numbers and order progress.",
      "Payment details: the M-Pesa phone number you pay from, the amount, the M-Pesa receipt code, our receipt number, and whether the payment succeeded. We never see or store your M-Pesa PIN.",
      "Support messages: the category and text of any complaint you send us.",
      "Nova assistant: the messages you type to Nova. We do not keep the conversation after you leave the chat. We keep only the time of each question, to limit misuse.",
      "Notifications: messages we create for you about your orders, payments and complaints.",
      "Technical data: basic logs created by our hosting providers (such as IP address and timestamps) to keep the service secure and working.",
      "We do not collect your location, contacts, photos or advertising identifiers. We do not show ads, we do not sell your data, and we do not use it for advertising.",
    ],
  },
  {
    heading: "How we use your information",
    bullets: [
      "To create and manage your account.",
      "To take, prepare and deliver your orders.",
      "To process payments and issue receipts.",
      "To send you updates about your orders, payments and complaints.",
      "To answer your questions and resolve complaints.",
      "To answer your questions through the Nova assistant.",
      "To keep the service secure and prevent fraud.",
      "To meet our legal and accounting obligations.",
    ],
  },
  {
    heading: "Nova, our AI assistant",
    paragraphs: [
      "Nova is powered by an AI service provided by Anthropic. When you ask Nova a question, we send the provider your message, our cake catalog, your name, and details of your most recent orders (order numbers, cake names, stages, payment status, amounts and event dates) so it can write a reply.",
      "We ask for your permission before you first use Nova. We do not send your phone number, email address or payment details to Nova. Nova can make mistakes, so check order details in the Orders tab. The provider handles the data under its own terms and privacy policy.",
    ],
  },
  {
    heading: "Who we share information with",
    paragraphs: [
      "We share information only with the services we need to run the app, and only what each one needs:",
    ],
    bullets: [
      "Supabase: our database, sign-in, file storage and servers.",
      "Safaricom (M-Pesa): to process your payments.",
      "Anthropic: to power the Nova assistant, as described above.",
      "Google: only if you choose to sign in with Google.",
      "Our own staff: people at " + LEGAL_CONFIG.businessName + " with a role in fulfilling orders and supporting customers.",
    ],
  },
  {
    heading: "Where your information is stored",
    paragraphs: [
      "Our providers may store and process information outside Kenya. We use providers with appropriate security safeguards. We may disclose information if the law requires it.",
    ],
  },
  {
    heading: "How long we keep it",
    bullets: [
      "Your account and profile: until you delete your account.",
      "Support complaints, notifications and Nova usage records: deleted when you delete your account.",
      "Order and payment records: kept after you delete your account because we must keep financial records. We remove your name, phone number and any text you typed (such as inscriptions and design notes) from them. They are kept for the period required by Kenyan law.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "Under the Data Protection Act, 2019 (Kenya) you have the right to ask for access to your information, to ask us to correct it, to object to certain uses, to ask for a copy, and to ask us to delete it.",
      "You can delete your account at any time inside the app: Profile, then Delete account. For any other request, email " + LEGAL_CONFIG.contactEmail + ". You also have the right to complain to the Office of the Data Protection Commissioner.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "We use encrypted connections, we make sure customers can only see their own information, and we limit staff access to what their role needs. No system is perfectly secure, so please keep your password private.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "The app is for people aged 18 and over. People under 18 may use it only with a parent or guardian. We do not knowingly collect information from children.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "We may update this policy from time to time. If a change is important, we will tell you in the app. The date at the top shows when it was last updated.",
    ],
  },
  {
    heading: "Contact us",
    paragraphs: [
      "" + LEGAL_CONFIG.businessName + ", Kenya. Email: " + LEGAL_CONFIG.contactEmail + ".",
    ],
  },
];
export const TERMS_OF_SERVICE: LegalSection[] = [
  {
    heading: "Agreement",
    paragraphs: [
      "By creating an account or using the " + LEGAL_CONFIG.businessName + " app you agree to these terms and to our Privacy Policy. If you do not agree, please do not use the app.",
    ],
  },
  {
    heading: "Your account",
    bullets: [
      "You must be 18 or over, or use the app with a parent or guardian.",
      "Give accurate information and keep your password private. You are responsible for activity on your account.",
      "We may suspend or close accounts used for fraud, abuse or breaking these terms.",
    ],
  },
  {
    heading: "Orders and prices",
    paragraphs: [
      "Prices are in Kenya shillings. The price of your cake is shown in the app before you pay and depends on the size and weight you choose. Prices may change, but a change does not affect an order you have already paid for.",
      "An order is confirmed after we review it. We may decline or cancel an order we cannot fulfil, and if we do, we will refund what you paid for it.",
    ],
  },
  {
    heading: "Notice and timing",
    paragraphs: [
      "Cakes need at least 2 days' notice before the event date. Please choose an accurate date. We will confirm progress in the app.",
    ],
  },
  {
    heading: "Payments",
    paragraphs: [
      "We accept M-Pesa. You can pay in full, or pay a 50% deposit and the balance later. The balance is due before or at delivery. You can pay it from the Orders tab with M-Pesa, or in cash on delivery. A cake is handed over only when it is fully paid. You receive a receipt for every payment.",
    ],
  },
  {
    heading: "Cancellations and refunds",
    paragraphs: [
      "" + LEGAL_CONFIG.cancellationPolicy + "",
    ],
  },
  {
    heading: "Allergies and ingredients",
    paragraphs: [
      "Our cakes may contain, or come into contact with, eggs, milk, wheat (gluten), nuts and other allergens. We cannot guarantee that any cake is free from allergens. Please tell us about allergies in the design notes, and contact us before ordering if you have a severe allergy.",
    ],
  },
  {
    heading: "Collection and delivery",
    paragraphs: [
      "We will confirm collection or delivery details with you. Please make sure someone is available to receive your cake. Cakes are perishable, so once delivered or collected, storing them properly is your responsibility.",
    ],
  },
  {
    heading: "The Nova assistant",
    paragraphs: [
      "Nova is an automated AI assistant. It can make mistakes and what it says is not a binding promise. The Orders tab and your receipts are the official record of your orders and payments. See the Privacy Policy for how Nova uses your information.",
    ],
  },
  {
    heading: "Acceptable use",
    bullets: [
      "Do not use the app for fraud, fake or disputed payments, or to harm others.",
      "Do not try to access other people's information or interfere with the app.",
      "Be respectful to our staff.",
    ],
  },
  {
    heading: "Our content",
    paragraphs: [
      "The photos, designs, text and brand in the app belong to " + LEGAL_CONFIG.businessName + ". Please do not copy or reuse them without our permission.",
    ],
  },
  {
    heading: "Ending your account",
    paragraphs: [
      "You can delete your account at any time in the app (Profile, then Delete account). You cannot delete it while you have active orders, so that we can finish what you have paid for. What we keep and delete is explained in the Privacy Policy.",
    ],
  },
  {
    heading: "Our responsibility",
    paragraphs: [
      "To the extent the law allows, we are not responsible for indirect or consequential losses. Nothing in these terms limits any right you have as a consumer under Kenyan law, or any liability that cannot legally be limited.",
    ],
  },
  {
    heading: "Governing law",
    paragraphs: [
      "These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction.",
    ],
  },
  {
    heading: "Changes and contact",
    paragraphs: [
      "We may update these terms. If a change is important, we will tell you in the app. Questions? Email " + LEGAL_CONFIG.contactEmail + ".",
    ],
  },
];