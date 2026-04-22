import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      closeButton
      swipeDirections={["top", "left", "right"]}
      visibleToasts={2}
      className="toaster group"
      toastOptions={{
        duration: 3800,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted group-[.toast]:hover:text-foreground",
          warning:
            "group-[.toaster]:!border-[#FDBA74] group-[.toaster]:!bg-[#FFF7ED] group-[.toaster]:!text-[#9A3412] dark:!border-orange-700/55 dark:!bg-orange-950/45 dark:!text-orange-50 [&_[data-description]]:!text-[#9A3412]/85 dark:[&_[data-description]]:!text-orange-100/85",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
