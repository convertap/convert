import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The shadcn class helper. Kept here because components.json points its util alias at it. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
