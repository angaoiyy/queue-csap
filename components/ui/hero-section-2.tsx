import React from "react";
import { Globe, MapPin, Phone } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type InfoIconType = "website" | "phone" | "address";

const InfoIcon = ({ type }: { type: InfoIconType }) => {
  const iconClassName = "h-5 w-5 text-primary";
  const icons: Record<InfoIconType, React.ReactNode> = {
    website: <Globe className={iconClassName} />,
    phone: <Phone className={iconClassName} />,
    address: <MapPin className={iconClassName} />,
  };

  return <div className="mr-2 flex-shrink-0">{icons[type]}</div>;
};

interface HeroSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  logo?: {
    url: string;
    alt: string;
    text?: string;
  };
  slogan?: string;
  title: React.ReactNode;
  subtitle: string;
  callToAction: {
    text: string;
    href: string;
  };
  backgroundImage: string;
  contactInfo: {
    website: string;
    phone: string;
    address: string;
  };
}

const HeroSection = React.forwardRef<HTMLDivElement, HeroSectionProps>(
  (
    {
      className,
      logo,
      slogan,
      title,
      subtitle,
      callToAction,
      backgroundImage,
      contactInfo,
      ...props
    },
    ref,
  ) => {
    const containerVariants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.15,
          delayChildren: 0.2,
        },
      },
    };

    const itemVariants = {
      hidden: { y: 20, opacity: 0 },
      visible: {
        y: 0,
        opacity: 1,
        transition: {
          duration: 0.5,
          ease: "easeOut",
        },
      },
    };

    return (
      <motion.section
        ref={ref}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-background text-foreground md:flex-row",
          className,
        )}
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        {...props}
      >
        <div className="flex w-full flex-col justify-between px-8 py-10 md:w-1/2 md:px-10 md:py-12 lg:w-3/5 lg:px-14 lg:py-14">
          <div>
            <motion.header className="mb-10 md:mb-12" variants={itemVariants}>
              {logo && (
                <div className="flex items-center">
                  <img src={logo.url} alt={logo.alt} className="mr-3 h-8" />
                  <div>
                    {logo.text && (
                      <p className="text-lg font-bold text-foreground">{logo.text}</p>
                    )}
                    {slogan && (
                      <p className="text-xs tracking-wider text-muted-foreground">{slogan}</p>
                    )}
                  </div>
                </div>
              )}
            </motion.header>

            <motion.main variants={containerVariants}>
              <motion.h1
                className="text-4xl font-bold leading-tight text-foreground md:text-5xl"
                variants={itemVariants}
              >
                {title}
              </motion.h1>
              <motion.div
                className="my-6 h-1 w-20 bg-primary"
                variants={itemVariants}
              />
              <motion.p
                className="mb-8 max-w-lg text-base text-muted-foreground"
                variants={itemVariants}
              >
                {subtitle}
              </motion.p>
              <motion.a
                href={callToAction.href}
                className="text-lg font-bold tracking-widest text-primary transition-colors hover:text-primary/80"
                variants={itemVariants}
              >
                {callToAction.text}
              </motion.a>
            </motion.main>
          </div>

          <motion.footer className="mt-10 w-full md:mt-12" variants={itemVariants}>
            <div className="grid grid-cols-1 gap-6 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center">
                <InfoIcon type="website" />
                <span>{contactInfo.website}</span>
              </div>
              <div className="flex items-center">
                <InfoIcon type="phone" />
                <span>{contactInfo.phone}</span>
              </div>
              <div className="flex items-center">
                <InfoIcon type="address" />
                <span>{contactInfo.address}</span>
              </div>
            </div>
          </motion.footer>
        </div>

        <motion.div
          className="w-full min-h-[360px] bg-cover bg-center md:w-1/2 md:min-h-full lg:w-2/5"
          style={{
            backgroundImage: `url(${backgroundImage})`,
          }}
          initial={{ clipPath: "polygon(100% 0, 100% 0, 100% 100%, 100% 100%)" }}
          animate={{ clipPath: "polygon(25% 0, 100% 0, 100% 100%, 0% 100%)" }}
          transition={{ duration: 1.2, ease: "circOut" }}
        />
      </motion.section>
    );
  },
);

HeroSection.displayName = "HeroSection";

export { HeroSection };
