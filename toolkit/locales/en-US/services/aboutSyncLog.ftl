# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

about-sync-log-title = Sync logs
about-sync-log-page-header =
    .heading = Sync logs
    .description = Diagnostic logs written by sync.

## Filter controls

about-sync-log-filter-type =
    .aria-label = Type
about-sync-log-filter-type-all =
    .label = All
about-sync-log-filter-type-success =
    .label = Success
about-sync-log-filter-type-error =
    .label = Error

about-sync-log-filter-date =
    .aria-label = Date
about-sync-log-filter-date-all =
    .label = All time
about-sync-log-filter-date-today =
    .label = Today
about-sync-log-filter-date-7days =
    .label = Last 7 days
about-sync-log-filter-date-30days =
    .label = Last 30 days

about-sync-log-search-input =
    .placeholder = Search logs
    .aria-label = Search logs

## Toolbar actions

about-sync-log-refresh-button =
    .label = Refresh
about-sync-log-download-button =
    .label = Download visible logs (.zip)
about-sync-log-clear-button =
    .label = Clear logs

## Log list

# Variables:
#   $count (Number) - Number of logs currently shown.
about-sync-log-count =
    { $count ->
        [one] { $count } log
       *[other] { $count } logs
    }

# Secondary line of a log row, shown under the date the log was written.
# Variables:
#   $value (number) - The amount of data (e.g. "12.3").
#   $unit (string) - The unit of data (e.g. "KB").
about-sync-log-row-success = Success — { $value } { $unit }
# Variables:
#   $value (number) - The amount of data (e.g. "12.3").
#   $unit (string) - The unit of data (e.g. "KB").
about-sync-log-row-error = Error — { $value } { $unit }

about-sync-log-empty =
    .label = No sync logs have been recorded.
about-sync-log-empty-filtered =
    .label = No logs match the current filters.

## Inline viewer

about-sync-log-expand =
    .title = Show log contents
    .aria-label = Show log contents
about-sync-log-collapse =
    .title = Hide log contents
    .aria-label = Hide log contents
about-sync-log-view-error = Could not read this log file.

# Button that opens the raw log file in a new browser tab.
about-sync-log-open-raw =
    .title = Open raw log
    .aria-label = Open raw log

## Clear logs confirmation

about-sync-log-clear-confirm-title = Clear sync logs?
# Variables:
#   $count (Number) - Number of logs that will be deleted.
about-sync-log-clear-confirm-message =
    { $count ->
        [one] This will permanently delete { $count } visible log file.
       *[other] This will permanently delete { $count } visible log files.
    }
about-sync-log-clear-confirm-accept = Delete
