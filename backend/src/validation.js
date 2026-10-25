const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateContact(input) {
  const contact = {
    name: clean(input?.name),
    email: clean(input?.email).toLowerCase(),
    phone: clean(input?.phone),
    message: clean(input?.message),
    website: clean(input?.website),
  };

  if (contact.website) {
    return { valid: false, reason: 'Spam detected' };
  }

  if (!contact.name || contact.name.length > 100) {
    return {
      valid: false,
      reason: 'Name is required and must be 100 characters or fewer',
    };
  }

  if (!EMAIL_PATTERN.test(contact.email) || contact.email.length > 254) {
    return { valid: false, reason: 'A valid email address is required' };
  }

  if (contact.phone.length > 40 || contact.message.length > 2000) {
    return {
      valid: false,
      reason: 'Contact details exceed the allowed length',
    };
  }

  delete contact.website;
  return { valid: true, value: contact };
}
