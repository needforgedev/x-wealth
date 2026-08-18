import { AlphaOtpBody } from "@/components/alpha/AlphaOtpBody";

export default function AlphaVerifyNumberPage() {
  return (
    <AlphaOtpBody
      heading="Verify Number"
      subheading="Enter your phone number"
      withPhone
      backHref="/alpha"
      nextHref="/alpha/otp"
    />
  );
}
