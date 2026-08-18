import { AlphaOtpBody } from "@/components/alpha/AlphaOtpBody";

export default function AlphaOtpPage() {
  return (
    <AlphaOtpBody
      heading="Enter OTP"
      subheading="We sent you a code"
      backHref="/alpha/verify-number"
      nextHref="/alpha/complete-profile"
    />
  );
}
