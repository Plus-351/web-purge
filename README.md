# Web Purge

Web Purge is a privacy utility browser extension designed to remove all browser data associated with configured target websites. It operates locally without telemetry or external network requests, ensuring user privacy and control.

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [Configuration](#configuration)
4. [Features](#features)
5. [Contributing](#contributing)
6. [License](#license)
7. [Contact](#contact)

## Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/web-purge.git
   ```

2. Navigate to the project directory:

   ```
   cd web-purge
   ```

3. Load the extension in your browser:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `web-purge` directory.

## Usage

- Click the extension icon in the toolbar to open the popup UI.
- Use the "PANIC" button to clean all enabled targets or the "Clean this domain" button to clean the current domain.
- Access the options page to configure categories and behaviors.

## Configuration

The extension's configuration is stored in `chrome.storage.sync`. You can enable or disable categories, add or remove domains, and import/export configurations in JSON format.

## Features

- Multiple preloaded domain category lists (Trackers, Social Networks, etc.)
- Manual and automatic cleanup triggers
- User-friendly popup and options UI
- Support for English and Spanish languages

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For questions or feedback, please reach out at [https://plus351.com/contact/].
